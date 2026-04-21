import {
  existsSync,
  mkdirSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { rm } from "node:fs/promises";
import chalk from "chalk";
import { cliError } from "../error.js";
import { getRootDir, resolveConfigPath } from "../mops.js";
import { MigrationsConfig } from "../types.js";

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
  const nextDir = migrations.next
    ? resolveConfigPath(migrations.next)
    : undefined;
  const nextFile = nextDir ? getNextMigrationFile(nextDir) : null;

  if (!existsSync(chainDir) && !nextFile) {
    cliError(
      `Migration chain directory not found: ${chainDir}\n` +
        "Run `mops migrate new <Name>` to initialize the migration chain.",
    );
  }

  const chainFiles = getMigrationFiles(chainDir);

  if (nextFile) {
    validateNextMigrationOrder(chainFiles, nextFile);
  }

  // Treat chain + next as one virtual merged list
  type MigrationEntry = { file: string; dir: string };
  const allMigrations: MigrationEntry[] = chainFiles.map((f) => ({
    file: f,
    dir: chainDir,
  }));
  if (nextFile && nextDir) {
    allMigrations.push({ file: nextFile, dir: nextDir });
  }

  const limit =
    mode === "check" ? migrations["check-limit"] : migrations["build-limit"];
  const isTrimming = limit !== undefined && limit < allMigrations.length;
  const needsTempDir = nextFile !== null || isTrimming;

  if (!needsTempDir) {
    return {
      migrationArgs: [`--enhanced-migration=${chainDir}`],
      cleanup: async () => {},
    };
  }

  // Skip staging when moc only needs the pending next migration: point it at
  // next-migration/ directly so diagnostics use the real path the user is
  // editing instead of a staged copy that gets cleaned up before the error
  // is read. Applies when the chain is empty or trimmed to 1.
  if (nextFile && nextDir && (chainFiles.length === 0 || limit === 1)) {
    const migrationArgs = [`--enhanced-migration=${nextDir}`];
    if (isTrimming) {
      migrationArgs.push("-A=M0254");
    }
    return { migrationArgs, cleanup: async () => {} };
  }

  const tempDir = stagedMigrationsDir(chainDir, canisterName);
  await rm(tempDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true });
  writeFileSync(join(tempDir, ".gitignore"), "*\n");

  const filesToInclude = isTrimming
    ? allMigrations.slice(-limit)
    : allMigrations;

  for (const { file, dir } of filesToInclude) {
    symlinkSync(resolve(dir, file), join(tempDir, file));
  }

  if (verbose) {
    console.log(
      chalk.blue("migrations"),
      chalk.gray(
        `Prepared ${filesToInclude.length} migration(s) for ${canisterName}` +
          (isTrimming ? ` (trimmed from ${allMigrations.length})` : ""),
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
