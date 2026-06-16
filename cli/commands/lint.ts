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
import { withFixLock } from "../helpers/fix-lock.js";
import { toolchain } from "./toolchain/index.js";
import { MOTOKO_GLOB_CONFIG } from "../constants.js";
import { existsSync } from "node:fs";
import { Config } from "../types.js";
import { getTrimmedMigrationFiles } from "../helpers/migrations.js";

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

function buildCommonArgs(
  options: Partial<LintOptions>,
  config: Config,
): string[] {
  const args: string[] = [];
  if (options.verbose) {
    args.push("--verbose");
  }
  if (options.fix) {
    args.push("--fix");
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
  return args;
}

function dropTrimmedMigrations(
  files: string[],
  rootDir: string,
  excluded: Set<string>,
): string[] {
  if (excluded.size === 0) {
    return files;
  }
  return files.filter((f) => !excluded.has(path.resolve(rootDir, f)));
}

async function runLintoko(
  lintokoBinPath: string,
  rootDir: string,
  args: string[],
  options: Partial<LintOptions>,
  label: string,
): Promise<boolean> {
  try {
    if (options.verbose) {
      console.log(
        chalk.blue("lint"),
        chalk.gray(`Running lintoko (${label}):`),
      );
      console.log(chalk.gray(lintokoBinPath));
      console.log(chalk.gray(JSON.stringify(args)));
    }

    const result = await execa(lintokoBinPath, args, {
      cwd: rootDir,
      stdio: "inherit",
      reject: false,
    });

    return result.exitCode === 0;
  } catch (err: any) {
    cliError(
      `Error while running lintoko${err?.message ? `\n${err.message}` : ""}`,
    );
  }
}

export async function lint(
  filter: string | undefined,
  options: Partial<LintOptions>,
): Promise<void> {
  if (options.fix) {
    return withFixLock(() => lintImpl(filter, options));
  }
  return lintImpl(filter, options);
}

async function lintImpl(
  filter: string | undefined,
  options: Partial<LintOptions>,
): Promise<void> {
  let config = readConfig();
  let rootDir = getRootDir();
  let lintokoBinPath = config.toolchain?.lintoko
    ? await toolchain.bin("lintoko")
    : "lintoko";

  const isExplicit = !!filter || !!(options.files && options.files.length > 0);
  const trimmedMigrations = isExplicit
    ? new Set<string>()
    : getTrimmedMigrationFiles(config);

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
    const before = filesToLint.length;
    filesToLint = dropTrimmedMigrations(
      filesToLint,
      rootDir,
      trimmedMigrations,
    );
    if (options.verbose && before !== filesToLint.length) {
      console.log(
        chalk.blue("lint"),
        chalk.gray(
          `Trimmed ${before - filesToLint.length} migration file(s) (check-limit)`,
        ),
      );
    }
  }

  const commonArgs = buildCommonArgs(options, config);

  // --- base run ---
  const baseArgs: string[] = [...commonArgs];
  const rules =
    options.rules !== undefined
      ? options.rules
      : await collectLintRules(config, rootDir);
  rules.forEach((rule) => baseArgs.push("--rules", rule));
  baseArgs.push(...filesToLint);

  let failed =
    filesToLint.length > 0 &&
    !(await runLintoko(lintokoBinPath, rootDir, baseArgs, options, "base"));

  // --- extra runs ---
  const extraEntries = config.lint?.extra;
  if (extraEntries) {
    const isFiltered = filter || (options.files && options.files.length > 0);
    const baseFileSet = isFiltered
      ? new Set(filesToLint.map((f) => path.resolve(rootDir, f)))
      : undefined;

    for (const [globPattern, ruleDirs] of Object.entries(extraEntries)) {
      if (!Array.isArray(ruleDirs) || ruleDirs.length === 0) {
        console.warn(
          chalk.yellow(
            `[lint.extra] skipping '${globPattern}': value must be a non-empty array of rule directories`,
          ),
        );
        continue;
      }

      for (const dir of ruleDirs) {
        if (!existsSync(path.join(rootDir, dir))) {
          cliError(
            `[lint.extra] rule directory '${dir}' not found (referenced by glob '${globPattern}')`,
          );
        }
      }

      let matchedFiles = globSync(path.join(rootDir, globPattern), {
        ...MOTOKO_GLOB_CONFIG,
        cwd: rootDir,
      });

      if (baseFileSet) {
        matchedFiles = matchedFiles.filter((f) =>
          baseFileSet.has(path.resolve(rootDir, f)),
        );
      }

      matchedFiles = dropTrimmedMigrations(
        matchedFiles,
        rootDir,
        trimmedMigrations,
      );

      if (matchedFiles.length === 0) {
        console.warn(
          chalk.yellow(
            `[lint.extra] no files matched glob '${globPattern}', skipping`,
          ),
        );
        continue;
      }

      const extraArgs: string[] = [...commonArgs];
      for (const dir of ruleDirs) {
        extraArgs.push("--rules", dir);
      }
      extraArgs.push(...matchedFiles);

      const passed = await runLintoko(
        lintokoBinPath,
        rootDir,
        extraArgs,
        options,
        `extra: ${globPattern}`,
      );
      failed ||= !passed;
    }
  }

  if (failed) {
    cliError("Lint failed");
  } else if (options.fix) {
    console.log(chalk.green("✓ Lint fixes applied"));
  } else {
    console.log(chalk.green("✓ Lint succeeded"));
  }
}
