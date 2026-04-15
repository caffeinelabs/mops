import { existsSync, mkdirSync, renameSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import chalk from "chalk";
import { cliError } from "../error.js";
import {
  getNextMigrationFile,
  validateMigrationsConfig,
  validateNextMigrationOrder,
} from "../helpers/migrations.js";
import { resolveCanisterConfigs } from "../helpers/resolve-canisters.js";
import { readConfig, resolveConfigPath } from "../mops.js";
import { CanisterConfig } from "../types.js";

function resolveMigrationCanister(canisterName?: string): {
  name: string;
  canister: CanisterConfig;
} {
  const config = readConfig();
  const canisters = resolveCanisterConfigs(config);
  const withMigrations = Object.entries(canisters).filter(
    ([, c]) => c.migrations,
  );

  if (withMigrations.length === 0) {
    cliError(
      "No canisters with [migrations] config found in mops.toml.\n" +
        "Add a [canisters.<name>.migrations] section first:\n\n" +
        "  [canisters.backend.migrations]\n" +
        '  chain = "migrations"\n' +
        '  next = "next-migration"',
    );
  }

  if (canisterName) {
    const canister = canisters[canisterName];
    if (!canister) {
      cliError(
        `Canister '${canisterName}' not found in mops.toml. Available: ${Object.keys(canisters).join(", ")}`,
      );
    }
    if (!canister.migrations) {
      cliError(
        `Canister '${canisterName}' has no [canisters.${canisterName}.migrations] config in mops.toml`,
      );
    }
    return { name: canisterName, canister };
  }

  if (withMigrations.length > 1) {
    cliError(
      `Multiple canisters with [migrations] config. Please specify one: ${withMigrations.map(([n]) => n).join(", ")}`,
    );
  }

  return { name: withMigrations[0]![0], canister: withMigrations[0]![1] };
}

function generateTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

const MIGRATION_TEMPLATE = `module {
  public func migration(old : {}) : {} {
    {}
  }
}
`;

export async function migrateNew(
  name: string,
  canisterName?: string,
): Promise<void> {
  const { name: resolvedName, canister } =
    resolveMigrationCanister(canisterName);
  const migrations = canister.migrations!;
  validateMigrationsConfig(migrations, resolvedName);

  const chainDir = resolveConfigPath(migrations.chain);
  const nextDir = resolveConfigPath(migrations.next);

  const existingNext = existsSync(nextDir)
    ? getNextMigrationFile(nextDir)
    : null;
  if (existingNext) {
    cliError(
      `A next migration already exists: ${existingNext}\n` +
        "Freeze it first with `mops migrate freeze`.",
    );
  }

  const timestamp = generateTimestamp();
  const fileName = `${timestamp}_${name}.mo`;

  validateNextMigrationOrder(chainDir, fileName);

  if (!existsSync(chainDir)) {
    mkdirSync(chainDir, { recursive: true });
  }
  if (!existsSync(nextDir)) {
    mkdirSync(nextDir, { recursive: true });
  }

  const filePath = join(nextDir, fileName);
  await writeFile(filePath, MIGRATION_TEMPLATE);

  console.log(chalk.green(`✓ Created migration: ${filePath}`));
}

export async function migrateFreeze(canisterName?: string): Promise<void> {
  const { name: resolvedName, canister } =
    resolveMigrationCanister(canisterName);
  const migrations = canister.migrations!;
  validateMigrationsConfig(migrations, resolvedName);

  const chainDir = resolveConfigPath(migrations.chain);
  const nextDir = resolveConfigPath(migrations.next);

  const nextFile = existsSync(nextDir) ? getNextMigrationFile(nextDir) : null;
  if (!nextFile) {
    cliError(
      "No next migration to freeze. Create one with `mops migrate new <Name>`.",
    );
  }

  validateNextMigrationOrder(chainDir, nextFile);

  if (!existsSync(chainDir)) {
    mkdirSync(chainDir, { recursive: true });
  }

  const src = join(nextDir, nextFile);
  const dest = join(chainDir, nextFile);
  renameSync(src, dest);

  console.log(chalk.green(`✓ Frozen migration: ${nextFile} → ${chainDir}/`));
}
