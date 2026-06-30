import { join } from "node:path";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import chalk from "chalk";
import { execa } from "execa";
import { cliError, cliExit } from "../error.js";
import {
  getCheckLimitPendingIssue,
  prepareMigrationArgs,
  reportCheckLimitPendingIssue,
} from "../helpers/migrations.js";
import { getGlobalMocArgs, readConfig, resolveConfigPath } from "../mops.js";
import { CanisterConfig, MigrationsConfig } from "../types.js";
import {
  filterCanisters,
  looksLikeFile,
  resolveCanisterConfigs,
  resolveSingleCanister,
  validateCanisterArgs,
} from "../helpers/resolve-canisters.js";
import { sourcesArgs } from "./sources.js";
import { toolchain } from "./toolchain/index.js";

// Per-invocation scratch dir lives under `.mops/`; `mkdtempSync` makes it unique so
// concurrent `mops` processes don't clobber each other's `old.most`/`new.most`.
const CHECK_STABLE_PARENT = ".mops";
const CHECK_STABLE_PREFIX = ".check-stable-";

export interface CheckStableOptions {
  verbose: boolean;
  extraArgs: string[];
  /** Commander `--no-check-limit`: false ignores [migrations].check-limit. */
  checkLimit: boolean;
}

export function resolveStablePath(
  canister: CanisterConfig,
  canisterName: string,
  options?: { required?: boolean },
): string | null {
  const stableConfig = canister["check-stable"];
  if (!stableConfig) {
    if (options?.required) {
      cliError(
        `Canister '${canisterName}' has no [canisters.${canisterName}.check-stable] configuration in mops.toml`,
      );
    }
    return null;
  }
  const stablePath = resolveConfigPath(stableConfig.path);
  if (stableConfig.skipIfMissing) {
    console.warn(
      chalk.yellow(
        `WARN: \`skipIfMissing\` in [canisters.${canisterName}.check-stable] is deprecated. ` +
          `Instead, create ${stableConfig.path} with an empty actor:\n` +
          "  // Version: 1.0.0\n" +
          "  actor { };",
      ),
    );
  }
  if (!existsSync(stablePath)) {
    if (stableConfig.skipIfMissing) {
      return null;
    }
    cliError(
      `Deployed file not found: ${stablePath} (canister '${canisterName}')\n` +
        `Create ${stableConfig.path} with an empty actor to enable the check:\n` +
        "  // Version: 1.0.0\n" +
        "  actor { };",
    );
  }
  return stablePath;
}

export async function checkStable(
  args: string[],
  options: Partial<CheckStableOptions> = {},
): Promise<void> {
  const config = readConfig();
  const mocPath = await toolchain.bin("moc", { fallback: true });
  const globalMocArgs = getGlobalMocArgs(config);

  const firstArg = args[0];
  if (firstArg && looksLikeFile(firstArg)) {
    const oldFile = firstArg;
    const canisterName = args[1];
    const { name, canister } = resolveSingleCanister(config, canisterName);

    if (!canister.main) {
      cliError(`No main file specified for canister '${name}' in mops.toml`);
    }

    validateCanisterArgs(canister, name, config);

    const migration = await prepareMigrationArgs(
      canister.migrations,
      name,
      "check",
      options.verbose,
      options.checkLimit === false,
    );
    try {
      await runStableCheck({
        oldFile,
        canisterMain: resolveConfigPath(canister.main),
        canisterName: name,
        mocPath,
        globalMocArgs,
        canisterArgs: [...migration.migrationArgs, ...(canister.args ?? [])],
        migrations: canister.migrations,
        options,
      });
    } finally {
      await migration.cleanup();
    }
    return;
  }

  const canisters = resolveCanisterConfigs(config);
  const canisterNames = args.length > 0 ? args : undefined;
  const filteredCanisters = filterCanisters(canisters, canisterNames);
  const sources = (await sourcesArgs()).flat();

  let checked = 0;
  for (const [name, canister] of Object.entries(filteredCanisters)) {
    if (!canister.main) {
      cliError(`No main file specified for canister '${name}' in mops.toml`);
    }

    validateCanisterArgs(canister, name, config);
    const stablePath = resolveStablePath(canister, name, {
      required: !!canisterNames,
    });
    if (!stablePath) {
      continue;
    }

    const migration = await prepareMigrationArgs(
      canister.migrations,
      name,
      "check",
      options.verbose,
      options.checkLimit === false,
    );
    try {
      await runStableCheck({
        oldFile: stablePath,
        canisterMain: resolveConfigPath(canister.main),
        canisterName: name,
        mocPath,
        globalMocArgs,
        canisterArgs: [...migration.migrationArgs, ...(canister.args ?? [])],
        sources,
        migrations: canister.migrations,
        options,
      });
    } finally {
      await migration.cleanup();
    }
    checked++;
  }

  if (checked === 0 && !canisterNames) {
    cliError(
      "No canisters with [check-stable] configuration found in mops.toml.\n" +
        "Either pass an old file: mops check-stable <old-file> [canister]\n" +
        "Or configure check-stable for a canister:\n\n" +
        "  [canisters.backend.check-stable]\n" +
        '  path = "deployed.mo"',
    );
  }
}

export interface RunStableCheckParams {
  oldFile: string;
  canisterMain: string;
  canisterName: string;
  mocPath: string;
  globalMocArgs: string[];
  canisterArgs: string[];
  sources?: string[];
  migrations?: MigrationsConfig;
  options?: Partial<CheckStableOptions>;
}

export async function runStableCheck(
  params: RunStableCheckParams,
): Promise<void> {
  const {
    oldFile,
    canisterMain,
    canisterName,
    mocPath,
    globalMocArgs,
    canisterArgs,
    options = {},
  } = params;

  const sources = params.sources ?? (await sourcesArgs()).flat();
  const isOldMostFile = oldFile.endsWith(".most");

  if (!existsSync(oldFile)) {
    cliError(`File not found: ${oldFile}`);
  }

  mkdirSync(CHECK_STABLE_PARENT, { recursive: true });
  const scratchDir = mkdtempSync(
    join(CHECK_STABLE_PARENT, CHECK_STABLE_PREFIX),
  );
  try {
    const oldMostPath = isOldMostFile
      ? oldFile
      : await generateStableTypes(
          mocPath,
          oldFile,
          join(scratchDir, "old.most"),
          sources,
          globalMocArgs,
          canisterArgs,
          options,
        );

    const newMostPath = await generateStableTypes(
      mocPath,
      canisterMain,
      join(scratchDir, "new.most"),
      sources,
      globalMocArgs,
      canisterArgs,
      options,
    );

    if (options.verbose) {
      console.log(
        chalk.blue("check-stable"),
        chalk.gray(`Comparing ${oldMostPath} ↔ ${newMostPath}`),
      );
    }

    const args = ["--stable-compatible", oldMostPath, newMostPath];
    if (options.verbose) {
      console.log(chalk.gray(mocPath, JSON.stringify(args)));
    }

    const result = await execa(mocPath, args, {
      stdio: "pipe",
      reject: false,
    });

    const issue = getCheckLimitPendingIssue(
      params.migrations,
      canisterName,
      oldMostPath,
      options.checkLimit === false,
      isOldMostFile,
    );

    if (issue) {
      reportCheckLimitPendingIssue(issue, result.exitCode !== 0);
    } else if (result.exitCode !== 0) {
      if (result.stderr) {
        console.error(result.stderr);
      }
      cliExit(
        result.exitCode ?? 1,
        `✗ Stable compatibility check failed for canister '${canisterName}'`,
      );
    }

    console.log(
      chalk.green(
        `✓ Stable compatibility check passed for canister '${canisterName}'`,
      ),
    );
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}

async function generateStableTypes(
  mocPath: string,
  moFile: string,
  outputPath: string,
  sources: string[],
  globalMocArgs: string[],
  canisterArgs: string[],
  options: Partial<CheckStableOptions>,
): Promise<string> {
  const wasmPath = outputPath.replace(/\.most$/, ".wasm");
  const args = [
    "--stable-types",
    "-o",
    wasmPath,
    moFile,
    ...sources,
    ...globalMocArgs,
    ...canisterArgs,
    ...(options.extraArgs ?? []),
  ];

  if (options.verbose) {
    console.log(
      chalk.blue("check-stable"),
      chalk.gray(`Generating stable types for ${moFile}`),
    );
    console.log(chalk.gray(mocPath, JSON.stringify(args)));
  }

  const result = await execa(mocPath, args, {
    stdio: "pipe",
    reject: false,
  });

  if (result.exitCode !== 0) {
    if (result.stderr) {
      console.error(result.stderr);
    }
    cliExit(
      result.exitCode ?? 1,
      `Failed to generate stable types for ${moFile} (exit code: ${result.exitCode})`,
    );
  }

  await rm(wasmPath, { force: true });

  return outputPath;
}
