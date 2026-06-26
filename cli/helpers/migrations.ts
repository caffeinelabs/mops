import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { rm } from "node:fs/promises";
import chalk from "chalk";
import { cliError } from "../error.js";
import { getRootDir, resolveConfigPath } from "../mops.js";
import { resolveCanisterConfigs } from "./resolve-canisters.js";
import { Config, MigrationsConfig } from "../types.js";
import {
  latestAppliedMigrationName,
  migrationBasename,
  parseMostAppliedMigrationNames,
} from "./parse-most.js";

function stagedMigrationsDir(chainDir: string, canisterName: string): string {
  return join(dirname(chainDir), `.migrations-${canisterName}`);
}

export interface MigrationArgsResult {
  migrationArgs: string[];
  cleanup: () => Promise<void>;
}

export function getMigrationFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith(".mo"))
    .sort();
}

export function getNextMigrationFile(nextDir: string): string | null {
  if (!existsSync(nextDir)) {
    return null;
  }
  const files = readdirSync(nextDir).filter((f) => f.endsWith(".mo"));
  if (files.length > 1) {
    cliError(
      `next-migration directory must contain at most 1 .mo file, found ${files.length} in ${nextDir}`,
    );
  }
  return files[0] ?? null;
}

export function validateNextMigrationOrder(
  chainDirOrFiles: string | string[],
  nextFile: string,
): void {
  const chainFiles =
    typeof chainDirOrFiles === "string"
      ? getMigrationFiles(chainDirOrFiles)
      : chainDirOrFiles;
  const lastChainFile = chainFiles[chainFiles.length - 1];
  if (lastChainFile && nextFile <= lastChainFile) {
    cliError(
      `Next migration "${nextFile}" must sort after all files in the chain.\n` +
        `Last chain file: "${lastChainFile}".\n` +
        "Use a timestamp prefix (e.g. YYYYMMDD_HHMMSS_Name.mo) to ensure correct ordering.",
    );
  }
}

export function validateMigrationsConfig(
  migrations: MigrationsConfig,
  canisterName: string,
): void {
  if (!migrations.chain) {
    cliError(
      `[canisters.${canisterName}.migrations] is missing required field "chain"`,
    );
  }
  for (const field of ["check-limit", "build-limit"] as const) {
    const value = migrations[field];
    if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
      cliError(
        `[canisters.${canisterName}.migrations] ${field} must be a positive integer`,
      );
    }
  }
  if (migrations.next) {
    const parentOf = (p: string) => dirname(resolve(getRootDir(), p));
    const chainParent = parentOf(migrations.chain);
    const nextParent = parentOf(migrations.next);
    if (chainParent !== nextParent) {
      cliError(
        `[canisters.${canisterName}.migrations] "chain" and "next" must live in the same parent directory.\n` +
          `  chain = "${migrations.chain}" (parent: ${chainParent})\n` +
          `  next  = "${migrations.next}" (parent: ${nextParent})\n` +
          "Place them in the same parent directory, e.g.:\n" +
          '  chain = "migrations"\n' +
          '  next  = "next-migration"',
      );
    }
  }
}

interface MigrationChain {
  chainDir: string;
  nextDir?: string;
  /** Entries to pass to moc, in order, after `*-limit` trimming. */
  included: { file: string; dir: string }[];
  /** Absolute paths of chain files dropped by trimming (next is never dropped). */
  excludedChainFiles: string[];
  /** True when `*-limit` excluded any entries. */
  isTrimming: boolean;
}

/**
 * Resolve the active migration chain for a canister: validate config, discover
 * files, and apply `check-limit` / `build-limit`. Single source of truth for
 * the trim semantics shared by `prepareMigrationArgs` (which stages `included`
 * for moc) and `getTrimmedMigrationFiles` (which feeds `excludedChainFiles`
 * to lint).
 */
function resolveMigrationChain(
  migrations: MigrationsConfig,
  canisterName: string,
  mode: "check" | "build",
  ignoreLimit = false,
): MigrationChain {
  validateMigrationsConfig(migrations, canisterName);

  const chainDir = resolveConfigPath(migrations.chain);
  const nextDir = migrations.next
    ? resolveConfigPath(migrations.next)
    : undefined;
  const nextFile = nextDir ? getNextMigrationFile(nextDir) : null;

  if (!existsSync(chainDir) && !nextFile) {
    cliError(
      `Migration chain directory not found: ${chainDir}\n` +
        "Create the directory and add a `.mo` migration file to initialize the chain.",
    );
  }

  const chainFiles = getMigrationFiles(chainDir);
  if (nextFile) {
    validateNextMigrationOrder(chainFiles, nextFile);
  }

  // Treat chain + next as one virtual merged list; `next` is always last.
  const all: { file: string; dir: string }[] = chainFiles.map((f) => ({
    file: f,
    dir: chainDir,
  }));
  if (nextFile && nextDir) {
    all.push({ file: nextFile, dir: nextDir });
  }

  const limit = ignoreLimit
    ? undefined
    : mode === "check"
      ? migrations["check-limit"]
      : migrations["build-limit"];
  const isTrimming = limit !== undefined && limit < all.length;
  const included = isTrimming ? all.slice(-limit!) : all;
  // Dropped entries are always a chain-only prefix (next sorts last).
  const excludedChainFiles = all
    .slice(0, all.length - included.length)
    .map((e) => resolve(e.dir, e.file));

  return { chainDir, nextDir, included, excludedChainFiles, isTrimming };
}

export async function prepareMigrationArgs(
  migrations: MigrationsConfig | undefined,
  canisterName: string,
  mode: "check" | "build",
  verbose?: boolean,
  ignoreLimit = false,
): Promise<MigrationArgsResult> {
  if (!migrations) {
    return { migrationArgs: [], cleanup: async () => {} };
  }

  const { chainDir, nextDir, included, excludedChainFiles, isTrimming } =
    resolveMigrationChain(migrations, canisterName, mode, ignoreLimit);

  const hasNext = included.some((e) => e.dir === nextDir);
  const needsTempDir = hasNext || isTrimming;

  if (!needsTempDir) {
    return {
      migrationArgs: [`--enhanced-migration=${chainDir}`],
      cleanup: async () => {},
    };
  }

  // Shortcut: only the pending next migration is included → point moc at
  // next-migration/ so diagnostics use the real path instead of the temp dir.
  if (nextDir && included.length === 1 && included[0]!.dir === nextDir) {
    const migrationArgs = [`--enhanced-migration=${nextDir}`];
    if (isTrimming) {
      migrationArgs.push("-A=M0254");
    }
    return { migrationArgs, cleanup: async () => {} };
  }

  // Per-invocation staging dir; `mkdtempSync` makes it unique so concurrent `mops`
  // processes don't clobber each other's symlinks. Cleaned up below in `cleanup()`.
  const baseDir = stagedMigrationsDir(chainDir, canisterName);
  mkdirSync(dirname(baseDir), { recursive: true });
  const tempDir = mkdtempSync(`${baseDir}-`);
  writeFileSync(join(tempDir, ".gitignore"), "*\n");

  for (const { file, dir } of included) {
    symlinkSync(resolve(dir, file), join(tempDir, file));
  }

  if (verbose) {
    const totalCount = included.length + excludedChainFiles.length;
    console.log(
      chalk.blue("migrations"),
      chalk.gray(
        `Prepared ${included.length} migration(s) for ${canisterName}` +
          (isTrimming ? ` (trimmed from ${totalCount})` : ""),
      ),
    );
  }

  const migrationArgs = [`--enhanced-migration=${tempDir}`];
  if (isTrimming) {
    migrationArgs.push("-A=M0254");
  }

  return {
    migrationArgs,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

/**
 * Local chain (+ next) files not yet recorded in the deployed `.most` baseline.
 */
export function getPendingMigrationFiles(
  migrations: MigrationsConfig,
  canisterName: string,
  appliedNames: string[],
): string[] {
  validateMigrationsConfig(migrations, canisterName);

  const chainDir = resolveConfigPath(migrations.chain);
  const nextDir = migrations.next
    ? resolveConfigPath(migrations.next)
    : undefined;
  const nextFile = nextDir ? getNextMigrationFile(nextDir) : null;

  const all = getMigrationFiles(chainDir);
  if (nextFile) {
    all.push(nextFile);
  }

  const highWaterMark =
    appliedNames.length > 0 ? latestAppliedMigrationName(appliedNames) : "";
  return all.filter((file) => migrationBasename(file) > highWaterMark);
}

/**
 * Pending migrations exceed `check-limit` relative to the deployed `.most` baseline.
 */
export interface CheckLimitPendingIssue {
  canisterName: string;
  pending: string[];
  checkLimit: number;
  latestApplied: string | null;
}

export function getCheckLimitPendingIssue(
  migrations: MigrationsConfig | undefined,
  canisterName: string,
  oldMostPath: string,
  ignoreCheckLimit: boolean,
  baselineIsMostFile: boolean,
): CheckLimitPendingIssue | null {
  if (!migrations || ignoreCheckLimit || !baselineIsMostFile) {
    return null;
  }
  const checkLimit = migrations["check-limit"];
  if (checkLimit === undefined) {
    return null;
  }

  let appliedNames: string[] | null;
  try {
    appliedNames = parseMostAppliedMigrationNames(
      readFileSync(oldMostPath, "utf8"),
    );
  } catch {
    return null;
  }
  if (appliedNames === null) {
    return null;
  }

  const pending = getPendingMigrationFiles(
    migrations,
    canisterName,
    appliedNames,
  );
  if (pending.length <= checkLimit) {
    return null;
  }

  return {
    canisterName,
    pending,
    checkLimit,
    latestApplied:
      appliedNames.length > 0 ? latestAppliedMigrationName(appliedNames) : null,
  };
}

function formatCheckLimitPendingLines(issue: CheckLimitPendingIssue): string[] {
  const { canisterName, pending, checkLimit } = issue;
  return [
    `Canister '${canisterName}' has ${pending.length} pending migration(s) but check-limit=${checkLimit} — ` +
      `mops check will likely fail, but deploy may still succeed. ` +
      `Fold all changes into the latest pending migration: ${pending[pending.length - 1]}`,
    `  Pending: ${pending.join(", ")}`,
    ...(issue.latestApplied
      ? [`  Latest already applied migration: ${issue.latestApplied}`]
      : []),
  ];
}

/** Warn on accidental compat pass; fail with this diagnostic when compat already failed. */
export function reportCheckLimitPendingIssue(
  issue: CheckLimitPendingIssue,
  compatFailed: boolean,
): void {
  const lines = formatCheckLimitPendingLines(issue);
  if (compatFailed) {
    cliError(
      `✗ Stable compatibility check failed for canister '${issue.canisterName}': too many pending migrations for check-limit=${issue.checkLimit}\n` +
        lines.join("\n"),
    );
  }
  console.warn(chalk.yellow(`WARN: ${lines[0]}`));
  for (const line of lines.slice(1)) {
    console.warn(chalk.yellow(line));
  }
}

/**
 * Absolute paths of chain migration files that `mops lint` should skip,
 * mirroring the `check-limit` trimming applied to `moc` during `mops check`.
 * Validates the migrations config along the way, so misconfig surfaces here
 * just as it does in `mops check` (consistent failure across commands).
 */
export function getTrimmedMigrationFiles(config: Config): Set<string> {
  const excluded = new Set<string>();
  for (const [name, canister] of Object.entries(
    resolveCanisterConfigs(config),
  )) {
    if (!canister.migrations) {
      continue;
    }
    const { excludedChainFiles } = resolveMigrationChain(
      canister.migrations,
      name,
      "check",
    );
    for (const f of excludedChainFiles) {
      excluded.add(f);
    }
  }
  return excluded;
}
