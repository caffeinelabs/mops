import path from "node:path";
import chalk from "chalk";
import { execa } from "execa";
import { cliError } from "../error.js";
import {
  getGlobalMocArgs,
  getRootDir,
  readConfig,
  resolveConfigPath,
} from "../mops.js";
import { AutofixResult, autofixMotoko } from "../helpers/autofix-motoko.js";
import { getMocSemVer } from "../helpers/get-moc-version.js";
import {
  filterCanisters,
  looksLikeFile,
  resolveCanisterConfigs,
  validateCanisterArgs,
} from "../helpers/resolve-canisters.js";
import { prepareMigrationArgs } from "../helpers/migrations.js";
import { CanisterConfig, Config } from "../types.js";
import { resolveStablePath, runStableCheck } from "./check-stable.js";
import { sourcesArgs } from "./sources.js";
import { toolchain } from "./toolchain/index.js";
import { collectLintRules, lint } from "./lint.js";

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

function checkAllLibsSupport(verbose?: boolean): boolean {
  const allLibs = supportsAllLibsFlag();
  if (!allLibs) {
    console.log(
      chalk.yellow(
        `moc < ${MOC_ALL_LIBS_MIN_VERSION}: some diagnostic hints may be missing`,
      ),
    );
  } else if (verbose) {
    console.log(
      chalk.blue("check"),
      chalk.gray("Using --all-libs for richer diagnostics"),
    );
  }
  return allLibs;
}

function logAutofixResult(
  fixResult: AutofixResult | null,
  verbose?: boolean,
): void {
  if (fixResult) {
    for (const [file, codes] of fixResult.fixedFiles) {
      const unique = [...new Set(codes)].sort();
      const n = codes.length;
      const rel = path.relative(process.cwd(), file);
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
  } else if (verbose) {
    console.log(chalk.yellow("No fixes were needed"));
  }
}

export async function check(
  args: string[],
  options: Partial<CheckOptions> = {},
): Promise<void> {
  const config = readConfig();
  const canisters = resolveCanisterConfigs(config);
  const hasCanisters = Object.keys(canisters).length > 0;
  const fileArgs = args.filter(looksLikeFile);
  const nonFileArgs = args.filter((a) => !looksLikeFile(a));
  const isFileMode = fileArgs.length > 0;

  if (isFileMode && nonFileArgs.length > 0) {
    cliError(
      `Cannot mix file paths and canister names: ${args.join(", ")}\n` +
        "Pass either file paths (e.g. mops check src/main.mo) or canister names (e.g. mops check backend)",
    );
  }

  if (isFileMode) {
    await checkFiles(config, fileArgs, options);
  } else {
    if (!hasCanisters) {
      cliError(
        "No canisters defined in mops.toml.\n" +
          "Either pass files: mops check <files...>\n" +
          "Or define canisters in mops.toml:\n\n" +
          "  [canisters.backend]\n" +
          '  main = "src/main.mo"',
      );
    }

    const canisterNames = args.length > 0 ? args : undefined;
    const filtered = filterCanisters(canisters, canisterNames);
    await checkCanisters(config, filtered, options);
  }

  if (config.toolchain?.lintoko) {
    const rootDir = getRootDir();
    const lintRules = await collectLintRules(config, rootDir);
    const lintFiles = isFileMode ? fileArgs : undefined;
    await lint(undefined, {
      verbose: options.verbose,
      fix: options.fix,
      rules: lintRules,
      files: lintFiles,
    });
  }
}

async function checkCanisters(
  config: Config,
  canisters: Record<string, CanisterConfig>,
  options: Partial<CheckOptions>,
): Promise<void> {
  const mocPath = await toolchain.bin("moc", { fallback: true });
  const sources = (await sourcesArgs()).flat();
  const globalMocArgs = getGlobalMocArgs(config);
  const allLibs = checkAllLibsSupport(options.verbose);

  for (const [canisterName, canister] of Object.entries(canisters)) {
    if (!canister.main) {
      cliError(
        `No main file specified for canister '${canisterName}' in mops.toml`,
      );
    }

    validateCanisterArgs(canister, canisterName, config);
    const motokoPath = resolveConfigPath(canister.main);

    const migration = await prepareMigrationArgs(
      canister.migrations,
      canisterName,
      "check",
      options.verbose,
    );
    try {
      const mocArgs = [
        "--check",
        ...(allLibs ? ["--all-libs"] : []),
        ...sources,
        ...globalMocArgs,
        ...migration.migrationArgs,
        ...(canister.args ?? []),
        ...(options.extraArgs ?? []),
      ];

      if (options.fix) {
        if (options.verbose) {
          console.log(
            chalk.blue("check"),
            chalk.gray(`Attempting to fix ${canisterName}`),
          );
        }

        const fixResult = await autofixMotoko(mocPath, [motokoPath], mocArgs);
        logAutofixResult(fixResult, options.verbose);
      }

      try {
        const args = [motokoPath, ...mocArgs];
        if (options.verbose) {
          console.log(
            chalk.blue("check"),
            chalk.gray(`Checking canister ${canisterName}:`),
          );
          console.log(chalk.gray(mocPath, JSON.stringify(args)));
        }

        const result = await execa(mocPath, args, {
          stdio: "inherit",
          reject: false,
        });

        if (result.exitCode !== 0) {
          cliError(
            `✗ Check failed for canister ${canisterName} (exit code: ${result.exitCode})`,
          );
        }

        console.log(chalk.green(`✓ ${canisterName}`));
      } catch (err: any) {
        cliError(
          `Error while checking canister ${canisterName}${err?.message ? `\n${err.message}` : ""}`,
        );
      }

      const stablePath = resolveStablePath(canister, canisterName);
      if (stablePath) {
        await runStableCheck({
          oldFile: stablePath,
          canisterMain: motokoPath,
          canisterName,
          mocPath,
          globalMocArgs,
          canisterArgs: [...migration.migrationArgs, ...(canister.args ?? [])],
          sources,
          options: { verbose: options.verbose, extraArgs: options.extraArgs },
          hasMigrations: !!canister.migrations,
        });
      }
    } finally {
      await migration.cleanup();
    }
  }
}

async function checkFiles(
  config: Config,
  files: string[],
  options: Partial<CheckOptions>,
): Promise<void> {
  const mocPath = await toolchain.bin("moc", { fallback: true });
  const sources = (await sourcesArgs()).flat();
  const globalMocArgs = getGlobalMocArgs(config);
  const allLibs = checkAllLibsSupport(options.verbose);

  const mocArgs = [
    "--check",
    ...(allLibs ? ["--all-libs"] : []),
    ...sources,
    ...globalMocArgs,
    ...(options.extraArgs ?? []),
  ];

  if (options.fix) {
    if (options.verbose) {
      console.log(chalk.blue("check"), chalk.gray("Attempting to fix files"));
    }

    const fixResult = await autofixMotoko(mocPath, files, mocArgs);
    logAutofixResult(fixResult, options.verbose);
  }

  for (const file of files) {
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

      console.log(chalk.green(`✓ ${file}`));
    } catch (err: any) {
      cliError(
        `Error while checking ${file}${err?.message ? `\n${err.message}` : ""}`,
      );
    }
  }
}
