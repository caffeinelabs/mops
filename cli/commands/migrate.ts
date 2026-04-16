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
        '  next = "next-migration"   # required for migrate new/freeze',
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

const VALID_NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

function generateTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `_${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`
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
  if (!VALID_NAME_RE.test(name)) {
    cliError(
      `Invalid migration name: "${name}"\n` +
        "Name must start with a letter and contain only letters, digits, and underscores.",
    );
  }

  const { name: resolvedName, canister } =
    resolveMigrationCanister(canisterName);
  const migrations = canister.migrations!;
  validateMigrationsConfig(migrations, resolvedName);

  if (!migrations.next) {
    cliError(
      `[canisters.${resolvedName}.migrations] is missing the "next" field.\n` +
        'Add next = "next-migration" to use `mops migrate new/freeze`.',
    );
  }

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

  if (!migrations.next) {
    cliError(
      `[canisters.${resolvedName}.migrations] is missing the "next" field.\n` +
        'Add next = "next-migration" to use `mops migrate new/freeze`.',
    );
  }

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
