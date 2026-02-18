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
  const mocArgs = ["--check", ...sources.flat(), ...(options.extraArgs ?? [])];

  const compileErrors = async (
    filesToCheck: string[],
  ): Promise<string | null> => {
    let allErrors = "";

    for (const file of filesToCheck) {
      const result = await execa(mocPath, [file, ...mocArgs], {
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
