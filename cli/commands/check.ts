import chalk from "chalk";
import { execa } from "execa";
import { cliError } from "../error.js";
import { getMocPath } from "../helpers/get-moc-path.js";
import { autofixMotoko } from "../helpers/autofix-motoko.js";
import { sourcesArgs } from "./sources.js";

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

  let mocPath = getMocPath();
  let sources = await sourcesArgs();

  // Helper function to compile and get errors
  const compileErrors = async (
    filesToCheck: string[],
  ): Promise<string | null> => {
    let allErrors = "";

    for (const file of filesToCheck) {
      let args = [
        "--check",
        file,
        ...sources.flat(),
        ...(options.extraArgs ?? []),
      ];

      const result = await execa(mocPath, args, {
        stdio: "pipe",
        reject: false,
      });

      if (result.stderr) {
        allErrors += result.stderr + "\n";
      }
      if (result.stdout?.trim()) {
        allErrors += result.stdout + "\n";
      }
    }

    return allErrors.trim() ? allErrors.trim() : null;
  };

  // If fix flag is enabled, attempt to fix errors
  if (options.fix) {
    if (options.verbose) {
      console.log(chalk.blue("check"), chalk.gray("Attempting to fix files"));
    }

    const fixResult = await autofixMotoko(fileList, compileErrors);
    if (fixResult) {
      console.log(
        chalk.green(
          `✓ Fixed ${fixResult.fixedCount} file(s) with the following fixes:`,
        ),
      );
      for (const [code, count] of Object.entries(fixResult.fixedErrorCounts)) {
        console.log(chalk.green(`  ${code}: ${count} fix(es)`));
      }
    } else {
      if (options.verbose) {
        console.log(chalk.yellow("No fixes were needed"));
      }
    }
  }

  // Final check to verify all files pass
  for (const file of fileList) {
    let args = [
      "--check",
      file,
      ...sources.flat(),
      ...(options.extraArgs ?? []),
    ];

    try {
      if (options.verbose) {
        console.log(chalk.blue("check"), chalk.gray("Running moc:"));
        console.log(chalk.gray(mocPath, JSON.stringify(args)));
      }

      const result = await execa(mocPath, args, {
        stdio: options.verbose ? "inherit" : "pipe",
        reject: false,
      });

      if (result.exitCode !== 0) {
        if (!options.verbose) {
          if (result.stderr) {
            console.error(chalk.red(result.stderr));
          }
          if (result.stdout?.trim()) {
            console.error(result.stdout);
          }
        }
        cliError(
          `✗ Check failed for file ${file} (exit code: ${result.exitCode})`,
        );
      }

      if (options.verbose && result.stdout && result.stdout.trim()) {
        console.log(result.stdout);
      }

      console.log(chalk.green(`✓ ${file}`));
    } catch (err: any) {
      cliError(
        `Error while checking ${file}${err?.message ? `\n${err.message}` : ""}`,
      );
    }
  }
}
