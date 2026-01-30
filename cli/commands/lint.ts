import chalk from "chalk";
import { execa } from "execa";
import { globSync } from "glob";
import path from "node:path";
import { cliError } from "../error.js";
import { getRootDir, readConfig } from "../mops.js";
import { toolchain } from "./toolchain/index.js";
import { MOTOKO_GLOB_CONFIG } from "../constants.js";

export interface LintOptions {
  verbose: boolean;
  fix: boolean;
  rules?: string[];
  extraArgs: string[];
}

export async function lint(
  inputs: string[] | undefined,
  options: Partial<LintOptions>,
): Promise<void> {
  let config = readConfig();
  let lintokoBinPath: string;

  if (config.toolchain?.lintoko) {
    lintokoBinPath = await toolchain.bin("lintoko");
  } else {
    lintokoBinPath = "lintoko";
  }

  let rootDir = getRootDir();

  // If no inputs provided, look for .mo files in lint(s) directory
  let filesToLint: string[] = [];
  if (!inputs || inputs.length === 0) {
    let globStr = "**/lint?(s)/**/*.mo";
    filesToLint = globSync(path.join(rootDir, globStr), {
      ...MOTOKO_GLOB_CONFIG,
      cwd: rootDir,
    });

    if (filesToLint.length === 0) {
      console.log(chalk.yellow("No Motoko files found in lint(s) directory"));
      console.log("Put your files to lint in 'lint' or 'lints' directory");
      return;
    }
  } else {
    filesToLint = inputs;
  }

  let args: string[] = [];
  if (options.verbose) {
    args.push("--verbose");
  }
  if (options.fix) {
    args.push("--fix");
  }
  if (options.rules && options.rules.length > 0) {
    for (let rule of options.rules) {
      args.push("--rules", rule);
    }
  }

  if (config.lint?.args) {
    if (typeof config.lint.args === "string") {
      cliError(
        `[lint] config 'args' should be an array of strings in mops.toml config file`,
      );
    }
    args.push(...config.lint.args);
  }

  if (options.extraArgs && options.extraArgs.length > 0) {
    args.push(...options.extraArgs);
  }

  args.push(...filesToLint);

  try {
    if (options.verbose) {
      console.log(chalk.gray(lintokoBinPath, JSON.stringify(args)));
    }

    console.log(chalk.blue("lint"), chalk.gray("Running lintoko..."));

    const result = await execa(lintokoBinPath, args, {
      stdio: "inherit",
      reject: false,
    });

    if (result.exitCode !== 0) {
      cliError(`Lint failed with exit code ${result.exitCode}`);
    }

    if (options.fix) {
      console.log(chalk.green("✓ Lint fixes applied"));
    } else {
      console.log(chalk.green("✓ Lint succeeded"));
    }
  } catch (err: any) {
    cliError(
      `Error while running lintoko${err?.message ? `\n${err.message}` : ""}`,
    );
  }
}
