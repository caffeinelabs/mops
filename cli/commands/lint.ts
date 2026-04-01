import chalk from "chalk";
import { execa } from "execa";
import { globSync } from "glob";
import path from "node:path";
import { CliError, cliError } from "../error.js";
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

async function resolveDepRules(
  config: Config,
  rootDir: string,
): Promise<string[]> {
  const ext = config.lint?.extends;
  if (!ext) {
    return [];
  }

  const resolvedPackages = await resolvePackages();
  const rules: string[] = [];
  const matched = new Set<string>();
  const hasRules = new Set<string>();

  for (const [name, version] of Object.entries(resolvedPackages)) {
    if (ext !== true && !ext.includes(name)) {
      continue;
    }
    matched.add(name);

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
      hasRules.add(name);
    }
  }

  if (Array.isArray(ext)) {
    const unresolved = ext.filter((n) => !matched.has(n));
    if (unresolved.length > 0) {
      console.warn(
        chalk.yellow(
          `[lint] extends: package(s) not found in dependencies: ${unresolved.join(", ")}`,
        ),
      );
    }
    const noRulesDir = ext.filter((n) => matched.has(n) && !hasRules.has(n));
    if (noRulesDir.length > 0) {
      console.warn(
        chalk.yellow(
          `[lint] extends: package(s) have no rules/ directory: ${noRulesDir.join(", ")}`,
        ),
      );
    }
  }

  return rules;
}

export async function collectLintRules(
  config: Config,
  rootDir: string,
): Promise<string[]> {
  const configRules = config.lint?.rules ?? [];
  for (const d of configRules) {
    if (!existsSync(path.join(rootDir, d))) {
      cliError(
        `[lint] rules: directory '${d}' not found. Check your mops.toml [lint] config.`,
      );
    }
  }
  const localRules =
    configRules.length > 0
      ? configRules
      : ["lint", "lints"].filter((d) => existsSync(path.join(rootDir, d)));
  const depRules = await resolveDepRules(config, rootDir);
  return [...localRules, ...depRules];
}

export interface LintOptions {
  verbose: boolean;
  fix: boolean;
  rules?: string[];
  files?: string[];
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

  let filesToLint: string[];
  if (options.files && options.files.length > 0) {
    filesToLint = options.files;
  } else {
    let globStr = filter ? `**/*${filter}*.mo` : "**/*.mo";
    filesToLint = globSync(path.join(rootDir, globStr), {
      ...MOTOKO_GLOB_CONFIG,
      cwd: rootDir,
    });
    if (filesToLint.length === 0) {
      cliError(
        filter
          ? `No files found for filter '${filter}'`
          : "No .mo files found in the project",
      );
    }
  }

  let args: string[] = [];
  if (options.verbose) {
    args.push("--verbose");
  }
  if (options.fix) {
    args.push("--fix");
  }
  const rules =
    options.rules !== undefined
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
    if (err instanceof CliError) {
      throw err;
    }
    cliError(
      `Error while running lintoko${err?.message ? `\n${err.message}` : ""}`,
    );
  }
}
