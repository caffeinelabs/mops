import { basename, join } from "node:path";
import { mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import chalk from "chalk";
import { execa } from "execa";
import { cliError } from "../error.js";
import { getGlobalMocArgs, readConfig } from "../mops.js";
import { resolveSingleCanister } from "../helpers/resolve-canisters.js";
import { sourcesArgs } from "./sources.js";
import { toolchain } from "./toolchain/index.js";

export interface CheckStableOptions {
  verbose: boolean;
  extraArgs: string[];
}

export async function checkStable(
  oldFile: string,
  canisterName: string | undefined,
  options: Partial<CheckStableOptions> = {},
): Promise<void> {
  const config = readConfig();
  const { name, canister } = resolveSingleCanister(config, canisterName);

  if (!canister.main) {
    cliError(`No main file specified for canister '${name}' in mops.toml`);
  }

  const mocPath = await toolchain.bin("moc", { fallback: true });
  const sources = (await sourcesArgs()).flat();
  const globalMocArgs = getGlobalMocArgs(config);
  const isOldMostFile = oldFile.endsWith(".most");

  const tempDir = await mkdtemp(join(tmpdir(), "mops-check-stable-"));
  try {
    const oldMostPath = isOldMostFile
      ? oldFile
      : await generateStableTypes(
          mocPath,
          oldFile,
          join(tempDir, "old.most"),
          sources,
          globalMocArgs,
          options,
        );

    const newMostPath = await generateStableTypes(
      mocPath,
      canister.main,
      join(tempDir, "new.most"),
      sources,
      globalMocArgs,
      options,
    );

    if (options.verbose) {
      console.log(
        chalk.blue("check-stable"),
        chalk.gray(`Comparing ${oldMostPath} ↔ ${newMostPath}`),
      );
    }

    const args = ["--stable-compatible", oldMostPath, newMostPath];
    if (options.verbose) {
      console.log(chalk.gray(mocPath, JSON.stringify(args)));
    }

    const result = await execa(mocPath, args, {
      stdio: "pipe",
      reject: false,
    });

    if (result.exitCode !== 0) {
      if (result.stderr) {
        console.error(result.stderr);
      }
      cliError(`✖ Stable compatibility check failed for canister '${name}'`);
    }

    console.log(
      chalk.green(`✓ Stable compatibility check passed for canister '${name}'`),
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function generateStableTypes(
  mocPath: string,
  moFile: string,
  outputPath: string,
  sources: string[],
  globalMocArgs: string[],
  options: Partial<CheckStableOptions>,
): Promise<string> {
  const args = [
    "--stable-types",
    moFile,
    ...sources,
    ...globalMocArgs,
    ...(options.extraArgs ?? []),
  ];

  if (options.verbose) {
    console.log(
      chalk.blue("check-stable"),
      chalk.gray(`Generating stable types for ${moFile}`),
    );
    console.log(chalk.gray(mocPath, JSON.stringify(args)));
  }

  const result = await execa(mocPath, args, {
    stdio: "pipe",
    reject: false,
  });

  if (result.exitCode !== 0) {
    if (result.stderr) {
      console.error(result.stderr);
    }
    cliError(
      `Failed to generate stable types for ${moFile} (exit code: ${result.exitCode})`,
    );
  }

  // moc --stable-types writes <basename>.most and <basename>.wasm to CWD
  const base = basename(moFile, ".mo");
  await rename(base + ".most", outputPath);
  await rm(base + ".wasm", { force: true });

  return outputPath;
}
