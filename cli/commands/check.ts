import chalk from "chalk";
import { execa } from "execa";
import { cliError } from "../error.js";
import { getMocPath } from "../helpers/get-moc-path.js";
import { sourcesArgs } from "./sources.js";

export interface CheckOptions {
  verbose: boolean;
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
