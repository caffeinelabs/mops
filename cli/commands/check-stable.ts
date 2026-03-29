import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import chalk from "chalk";
import { execa } from "execa";
import { cliError } from "../error.js";
import { getGlobalMocArgs, readConfig, resolveConfigPath } from "../mops.js";
import { resolveSingleCanister } from "../helpers/resolve-canisters.js";
import { sourcesArgs } from "./sources.js";
import { toolchain } from "./toolchain/index.js";

const CHECK_STABLE_DIR = ".mops/.check-stable";

const PATH_FLAGS = ["--actor-idl"];

function resolveArgsForCwd(args: string[], cwd: string): string[] {
  const resolved: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;

    const eqFlag = PATH_FLAGS.find((f) => arg.startsWith(f + "="));
    if (eqFlag) {
      const value = arg.slice(eqFlag.length + 1);
      if (!isAbsolute(value)) {
        resolved.push(`${eqFlag}=${relative(cwd, resolve(value))}`);
        continue;
      }
    }

    if (PATH_FLAGS.includes(arg) && i + 1 < args.length) {
      resolved.push(arg);
      i++;
      const next = args[i] as string;
      resolved.push(isAbsolute(next) ? next : relative(cwd, resolve(next)));
      continue;
    }

    resolved.push(arg);
  }
  return resolved;
}

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
  const globalMocArgs = getGlobalMocArgs(config);

  await runStableCheck({
    oldFile,
    canisterMain: resolveConfigPath(canister.main),
    canisterName: name,
    mocPath,
    globalMocArgs,
    options,
  });
}

export interface RunStableCheckParams {
  oldFile: string;
  canisterMain: string;
  canisterName: string;
  mocPath: string;
  globalMocArgs: string[];
  options?: Partial<CheckStableOptions>;
}

export async function runStableCheck(
  params: RunStableCheckParams,
): Promise<void> {
  const {
    oldFile,
    canisterMain,
    canisterName,
    mocPath,
    globalMocArgs,
    options = {},
  } = params;

  const checkStableDir = resolve(CHECK_STABLE_DIR);
  const sources = (await sourcesArgs({ cwd: checkStableDir })).flat();
  const isOldMostFile = oldFile.endsWith(".most");

  if (!existsSync(oldFile)) {
    cliError(`File not found: ${oldFile}`);
  }

  await rm(CHECK_STABLE_DIR, { recursive: true, force: true });
  mkdirSync(CHECK_STABLE_DIR, { recursive: true });
  try {
    const oldMostPath = isOldMostFile
      ? oldFile
      : await generateStableTypes(
          mocPath,
          oldFile,
          join(CHECK_STABLE_DIR, "old.most"),
          sources,
          globalMocArgs,
          options,
        );

    const newMostPath = await generateStableTypes(
      mocPath,
      canisterMain,
      join(CHECK_STABLE_DIR, "new.most"),
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
      cliError(
        `✗ Stable compatibility check failed for canister '${canisterName}'`,
      );
    }

    console.log(
      chalk.green(
        `✓ Stable compatibility check passed for canister '${canisterName}'`,
      ),
    );
  } finally {
    await rm(CHECK_STABLE_DIR, { recursive: true, force: true });
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
  const checkStableDir = resolve(CHECK_STABLE_DIR);
  const relFile = relative(checkStableDir, resolve(moFile));
  const adjustedMocArgs = resolveArgsForCwd(globalMocArgs, checkStableDir);
  const args = [
    "--stable-types",
    relFile,
    ...sources,
    ...adjustedMocArgs,
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
    cwd: CHECK_STABLE_DIR,
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

  const base = basename(moFile, ".mo");
  await rename(join(CHECK_STABLE_DIR, base + ".most"), outputPath);
  await rm(join(CHECK_STABLE_DIR, base + ".wasm"), { force: true });

  return outputPath;
}
