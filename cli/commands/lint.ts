import chalk from "chalk";
import { execa } from "execa";
import { globSync } from "glob";
import path from "node:path";
import { cliError } from "../error.js";
import {
  formatDir,
  formatGithubDir,
  getDependencyType,
  getRootDir,
  readConfig,
} from "../mops.js";
import { resolvePackages } from "../resolve-packages.js";
import { toolchain } from "./toolchain/index.js";
import { MOTOKO_GLOB_CONFIG } from "../constants.js";
import { existsSync } from "node:fs";
import { Config } from "../types.js";

export async function resolveDepRules(
  config: Config,
  rootDir: string,
): Promise<string[]> {
  const ext = config.lint?.extends;
  if (!ext) {
    return [];
  }

  const resolvedPackages = await resolvePackages();
  const rules: string[] = [];

  for (const [name, version] of Object.entries(resolvedPackages)) {
    if (ext !== true && !ext.includes(name)) {
      continue;
    }

    const depType = getDependencyType(version);
    let pkgDir: string;
    if (depType === "local") {
      pkgDir = version;
    } else if (depType === "github") {
      pkgDir = formatGithubDir(name, version);
    } else {
      pkgDir = formatDir(name, version);
    }

    const rulesDir = path.join(pkgDir, "rules");
    if (existsSync(rulesDir)) {
      rules.push(path.relative(rootDir, rulesDir));
    }
  }

  return rules;
}

export async function collectLintRules(
  config: Config,
  rootDir: string,
): Promise<string[]> {
  const localRules = ["lint", "lints"].filter((d) =>
    existsSync(path.join(rootDir, d)),
  );
  const configRules = config.lint?.rules ?? [];
  const depRules = await resolveDepRules(config, rootDir);
  return [...localRules, ...configRules, ...depRules];
}

export interface LintOptions {
  verbose: boolean;
  fix: boolean;
  rules?: string[];
  extraArgs: string[];
}

export async function lint(
  filter: string | undefined,
  options: Partial<LintOptions>,
): Promise<void> {
  let config = readConfig();
  let rootDir = getRootDir();
  let lintokoBinPath = config.toolchain?.lintoko
    ? await toolchain.bin("lintoko")
    : "lintoko";

  let globStr = filter ? `**/*${filter}*.mo` : "**/*.mo";
  let filesToLint = globSync(path.join(rootDir, globStr), {
    ...MOTOKO_GLOB_CONFIG,
    cwd: rootDir,
  });
  if (filesToLint.length === 0) {
    cliError(`No files found for filter '${filter}'`);
  }

  let args: string[] = [];
  if (options.verbose) {
    args.push("--verbose");
  }
  if (options.fix) {
    args.push("--fix");
  }
  const rules =
    options.rules && options.rules.length > 0
      ? options.rules
      : await collectLintRules(config, rootDir);
  rules.forEach((rule) => args.push("--rules", rule));

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
      console.log(chalk.blue("lint"), chalk.gray("Running lintoko:"));
      console.log(chalk.gray(lintokoBinPath));
      console.log(chalk.gray(JSON.stringify(args)));
    }

    const result = await execa(lintokoBinPath, args, {
      cwd: rootDir,
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
