import { relative } from "node:path";
import { existsSync } from "node:fs";
import chalk from "chalk";
import { execa } from "execa";
import { cliError } from "../error.js";
import { getGlobalMocArgs, readConfig } from "../mops.js";
import { autofixMotoko } from "../helpers/autofix-motoko.js";
import { getMocSemVer } from "../helpers/get-moc-version.js";
import {
  resolveCanisterConfigs,
  resolveCanisterEntrypoints,
} from "../helpers/resolve-canisters.js";
import { runStableCheck } from "./check-stable.js";
import { sourcesArgs } from "./sources.js";
import { toolchain } from "./toolchain/index.js";

const MOC_ALL_LIBS_MIN_VERSION = "1.3.0";

function supportsAllLibsFlag(): boolean {
  const version = getMocSemVer();
  return version ? version.compare(MOC_ALL_LIBS_MIN_VERSION) >= 0 : false;
}

export interface CheckOptions {
  verbose: boolean;
  fix: boolean;
  extraArgs: string[];
}

export async function check(
  files: string | string[],
  options: Partial<CheckOptions> = {},
): Promise<void> {
  let fileList = Array.isArray(files) ? files : files ? [files] : [];

  const config = readConfig();

  if (fileList.length === 0) {
    fileList = resolveCanisterEntrypoints(config);
  }

  if (fileList.length === 0) {
    cliError(
      "No Motoko files specified and no canisters defined in mops.toml.\n" +
        "Either pass files: mops check <files...>\n" +
        "Or define canisters in mops.toml:\n\n" +
        "  [canisters.backend]\n" +
        '  main = "src/main.mo"',
    );
  }
  const mocPath = await toolchain.bin("moc", { fallback: true });
  const sources = await sourcesArgs();
  const globalMocArgs = getGlobalMocArgs(config);

  // --all-libs enables richer diagnostics with edit suggestions from moc (requires moc >= 1.3.0)
  const allLibs = supportsAllLibsFlag();

  if (!allLibs) {
    console.log(
      chalk.yellow(
        `moc < ${MOC_ALL_LIBS_MIN_VERSION}: some diagnostic hints may be missing`,
      ),
    );
  } else if (options.verbose) {
    console.log(
      chalk.blue("check"),
      chalk.gray("Using --all-libs for richer diagnostics"),
    );
  }

  const mocArgs = [
    "--check",
    ...(allLibs ? ["--all-libs"] : []),
    ...sources.flat(),
    ...globalMocArgs,
    ...(options.extraArgs ?? []),
  ];

  if (options.fix) {
    if (options.verbose) {
      console.log(chalk.blue("check"), chalk.gray("Attempting to fix files"));
    }

    const fixResult = await autofixMotoko(mocPath, fileList, mocArgs);
    if (fixResult) {
      for (const [file, codes] of fixResult.fixedFiles) {
        const unique = [...new Set(codes)].sort();
        const n = codes.length;
        const rel = relative(process.cwd(), file);
        console.log(
          chalk.green(
            `Fixed ${rel} (${n} ${n === 1 ? "fix" : "fixes"}: ${unique.join(", ")})`,
          ),
        );
      }
      const fileCount = fixResult.fixedFiles.size;
      console.log(
        chalk.green(
          `\n✓ ${fixResult.totalFixCount} ${fixResult.totalFixCount === 1 ? "fix" : "fixes"} applied to ${fileCount} ${fileCount === 1 ? "file" : "files"}`,
        ),
      );
    } else {
      if (options.verbose) {
        console.log(chalk.yellow("No fixes were needed"));
      }
    }
  }

  for (const file of fileList) {
    try {
      const args = [file, ...mocArgs];
      if (options.verbose) {
        console.log(chalk.blue("check"), chalk.gray("Running moc:"));
        console.log(chalk.gray(mocPath, JSON.stringify(args)));
      }

      const result = await execa(mocPath, args, {
        stdio: "inherit",
        reject: false,
      });

      if (result.exitCode !== 0) {
        cliError(
          `✗ Check failed for file ${file} (exit code: ${result.exitCode})`,
        );
      }

      if (!options.fix) {
        console.log(chalk.green(`✓ ${file}`));
      }
    } catch (err: any) {
      cliError(
        `Error while checking ${file}${err?.message ? `\n${err.message}` : ""}`,
      );
    }
  }

  if (options.fix) {
    return;
  }

  const canisters = resolveCanisterConfigs(config);
  for (const [name, canister] of Object.entries(canisters)) {
    const stableConfig = canister["check-stable"];
    if (!stableConfig) {
      continue;
    }

    if (!canister.main) {
      cliError(`No main file specified for canister '${name}' in mops.toml`);
    }

    if (!existsSync(stableConfig.path)) {
      if (stableConfig.skipIfMissing) {
        continue;
      }
      cliError(
        `Deployed file not found: ${stableConfig.path} (canister '${name}')\n` +
          "Set skipIfMissing = true in [canisters." +
          name +
          ".check-stable] to skip this check when the file is missing.",
      );
    }

    await runStableCheck({
      oldFile: stableConfig.path,
      canisterMain: canister.main,
      canisterName: name,
      mocPath,
      rawSources: sources,
      globalMocArgs,
      options: { verbose: options.verbose, extraArgs: options.extraArgs },
    });
  }
}
