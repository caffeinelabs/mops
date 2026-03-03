import chalk from "chalk";
import { execa } from "execa";
import { cliError } from "../error.js";
import { autofixMotoko } from "../helpers/autofix-motoko.js";
import { getMocSemVer } from "../helpers/get-moc-version.js";
import { sourcesArgs } from "./sources.js";
import { toolchain } from "./toolchain/index.js";

const MOC_ALL_LIBS_MIN_VERSION = "1.3.0";

function supportsAllLibsFlag(mocPath: string): boolean {
  const version = getMocSemVer(mocPath);
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
  const fileList = Array.isArray(files) ? files : [files];

  if (fileList.length === 0) {
    cliError("No Motoko files specified for checking");
  }

  const mocPath = await toolchain.bin("moc", { fallback: true });
  const sources = await sourcesArgs();

  // --all-libs enables richer diagnostics with edit suggestions from moc (requires moc >= 1.3.0)
  const allLibs = supportsAllLibsFlag(mocPath);

  if (options.verbose) {
    if (allLibs) {
      console.log(
        chalk.blue("check"),
        chalk.gray("Using --all-libs for richer diagnostics"),
      );
    } else {
      console.log(
        chalk.yellow(
          `moc < ${MOC_ALL_LIBS_MIN_VERSION}: some diagnostic hints may be missing`,
        ),
      );
    }
  }

  const mocArgs = [
    "--check",
    ...(allLibs ? ["--all-libs"] : []),
    ...sources.flat(),
    ...(options.extraArgs ?? []),
  ];

  if (options.fix) {
    if (options.verbose) {
      console.log(chalk.blue("check"), chalk.gray("Attempting to fix files"));
    }

    const fixResult = await autofixMotoko(mocPath, fileList, mocArgs);
    if (fixResult) {
      console.log(
        chalk.green(
          `✓ Fixed ${fixResult.fixedCount} file(s) with the following fixes:`,
        ),
      );
      for (const [code, count] of Object.entries(
        fixResult.fixedDiagnosticCounts,
      )) {
        console.log(chalk.green(`  ${code}: ${count} fix(es)`));
      }
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

      console.log(chalk.green(`✓ ${file}`));
    } catch (err: any) {
      cliError(
        `Error while checking ${file}${err?.message ? `\n${err.message}` : ""}`,
      );
    }
  }
}
