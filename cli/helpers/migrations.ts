import { existsSync, mkdirSync, readdirSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { rm } from "node:fs/promises";
import chalk from "chalk";
import { cliError } from "../error.js";
import { resolveConfigPath } from "../mops.js";
import { MigrationsConfig } from "../types.js";

const MIGRATIONS_TEMP_DIR = ".mops/.migrations";

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
  chainDir: string,
  nextFile: string,
): void {
  const chainFiles = getMigrationFiles(chainDir);
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
  if (!migrations.next) {
    cliError(
      `[canisters.${canisterName}.migrations] is missing required field "next"`,
    );
  }
  if (
    migrations["check-limit"] !== undefined &&
    migrations["check-limit"] <= 0
  ) {
    cliError(`[canisters.${canisterName}.migrations] check-limit must be > 0`);
  }
  if (
    migrations["build-limit"] !== undefined &&
    migrations["build-limit"] <= 0
  ) {
    cliError(`[canisters.${canisterName}.migrations] build-limit must be > 0`);
  }
}

export async function prepareMigrationArgs(
  migrations: MigrationsConfig | undefined,
  canisterName: string,
  mode: "check" | "build",
  verbose?: boolean,
): Promise<MigrationArgsResult> {
  const noOp: MigrationArgsResult = {
    migrationArgs: [],
    cleanup: async () => {},
  };

  if (!migrations) {
    return noOp;
  }

  validateMigrationsConfig(migrations, canisterName);

  const chainDir = resolveConfigPath(migrations.chain);
  const nextDir = resolveConfigPath(migrations.next);
  const nextFile = getNextMigrationFile(nextDir);

  if (!existsSync(chainDir) && !nextFile) {
    cliError(
      `Migration chain directory not found: ${chainDir}\n` +
        "Run `mops migrate new <Name>` to initialize the migration chain.",
    );
  }

  const chainFiles = getMigrationFiles(chainDir);

  if (nextFile) {
    validateNextMigrationOrder(chainDir, nextFile);
  }

  const limit =
    mode === "check" ? migrations["check-limit"] : migrations["build-limit"];
  const isTrimming = limit !== undefined && limit < chainFiles.length;
  const needsTempDir = nextFile !== null || isTrimming;

  if (!needsTempDir) {
    return {
      migrationArgs: [`--enhanced-migration=${chainDir}`],
      cleanup: async () => {},
    };
  }

  const tempDir = join(MIGRATIONS_TEMP_DIR, canisterName);
  await rm(tempDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true });

  const filesToInclude = isTrimming
    ? chainFiles.slice(-limit)
    : [...chainFiles];

  for (const file of filesToInclude) {
    const target = resolve(chainDir, file);
    symlinkSync(target, join(tempDir, file));
  }

  if (nextFile) {
    const target = resolve(nextDir, nextFile);
    symlinkSync(target, join(tempDir, nextFile));
  }

  if (verbose) {
    const total = filesToInclude.length + (nextFile ? 1 : 0);
    console.log(
      chalk.blue("migrations"),
      chalk.gray(
        `Prepared ${total} migration(s) for ${canisterName}` +
          (isTrimming ? ` (trimmed from ${chainFiles.length})` : ""),
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
