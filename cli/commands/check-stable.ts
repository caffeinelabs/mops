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
import {
  hasStableBaselineFix,
  supportsStableBaselineCheck,
} from "../helpers/get-moc-version.js";
import { sourcesArgs } from "./sources.js";
import { toolchain } from "./toolchain/index.js";

// Per-invocation scratch dir lives under `.mops/`; `mkdtempSync` makes it unique so
// concurrent `mops` processes don't clobber each other's `old.most`/`new.most`.
const CHECK_STABLE_PARENT = ".mops";
const CHECK_STABLE_PREFIX = ".check-stable-";

/** moc `--stable-baseline` only works together with `--enhanced-migration`. */
function hasEnhancedMigrationArg(args: string[]): boolean {
  return args.some(
    (a) =>
      a === "--enhanced-migration" || a.startsWith("--enhanced-migration="),
  );
}

/** moc 1.12.0+ with the `--stable-baseline` fix: one `moc --check` instead of 3. */
export function canUseStableBaselineCheck(canisterArgs: string[]): boolean {
  return (
    supportsStableBaselineCheck() &&
    hasStableBaselineFix() &&
    hasEnhancedMigrationArg(canisterArgs)
  );
}

export interface CheckStableOptions {
  verbose: boolean;
  extraArgs: string[];
  /** Commander `--no-check-limit`: false ignores [migrations].check-limit. */
  checkLimit: boolean;
}

// A baseline compiled from a `.mo` source only approximates what is deployed:
// it is whatever that source says today, not what the running canister holds.
// Deliberately no "run X" hint here: how a baseline gets produced depends on
// who deploys, and naming one command would be wrong for the others.
export function requireMostBaseline(
  baselinePath: string,
  origin: string,
): void {
  if (baselinePath.endsWith(".most")) {
    return;
  }
  cliError(
    `${origin} must be a .most file, got: ${baselinePath}\n` +
      "A .mo source is only an approximation of what is deployed.",
  );
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
  requireMostBaseline(
    stableConfig.path,
    `[canisters.${canisterName}.check-stable].path`,
  );
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
  const mocPath = await toolchain.bin("moc");
  const globalMocArgs = getGlobalMocArgs(config);

  const firstArg = args[0];
  if (firstArg && looksLikeFile(firstArg)) {
    const baselineMost = firstArg;
    requireMostBaseline(baselineMost, "Baseline");
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
        baselineMost,
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
        baselineMost: stablePath,
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
        "Either pass a baseline: mops check-stable <baseline.most> [canister]\n" +
        "Or configure check-stable for a canister:\n\n" +
        "  [canisters.backend.check-stable]\n" +
        '  path = "deployed/backend.most"',
    );
  }
}

export interface RunStableCheckParams {
  /** Committed `.most` baseline — callers go through `requireMostBaseline`. */
  baselineMost: string;
  canisterMain: string;
  canisterName: string;
  mocPath: string;
  globalMocArgs: string[];
  canisterArgs: string[];
  sources?: string[];
  migrations?: MigrationsConfig;
  options?: Partial<CheckStableOptions>;
}

export function reportStableCheckOutcome(
  canisterName: string,
  params: {
    migrations?: MigrationsConfig;
    oldMostPath: string;
    checkLimit?: boolean;
    exitCode: number | null | undefined;
    stderr?: string;
  },
): void {
  const issue = getCheckLimitPendingIssue(
    params.migrations,
    canisterName,
    params.oldMostPath,
    params.checkLimit === false,
  );

  if (issue) {
    reportCheckLimitPendingIssue(issue, params.exitCode !== 0);
  } else if (params.exitCode !== 0) {
    if (params.stderr) {
      console.error(params.stderr);
    }
    cliExit(
      params.exitCode ?? 1,
      `✗ Stable compatibility check failed for canister '${canisterName}'`,
    );
  }

  console.log(
    chalk.green(
      `✓ Stable compatibility check passed for canister '${canisterName}'`,
    ),
  );
}

/**
 * One `moc --check --stable-baseline` covering typecheck + upgrade compat.
 * `baselinePath` is always a committed `.most` — see `runStableCheck`.
 */
async function runFoldedStableCheck(params: {
  canisterMain: string;
  canisterName: string;
  mocPath: string;
  baselinePath: string;
  sources: string[];
  globalMocArgs: string[];
  canisterArgs: string[];
  migrations?: MigrationsConfig;
  options: Partial<CheckStableOptions>;
}): Promise<void> {
  const args = [
    params.canisterMain,
    "--check",
    "--all-libs",
    "--stable-baseline",
    params.baselinePath,
    ...params.sources,
    ...params.globalMocArgs,
    ...params.canisterArgs,
    ...(params.options.extraArgs ?? []),
  ];

  if (params.options.verbose) {
    console.log(
      chalk.blue("check-stable"),
      chalk.gray(
        `Checking ${params.canisterMain} against baseline ${params.baselinePath}`,
      ),
    );
    console.log(chalk.gray(params.mocPath, JSON.stringify(args)));
  }

  const result = await execa(params.mocPath, args, {
    stdio: "pipe",
    reject: false,
  });

  reportStableCheckOutcome(params.canisterName, {
    migrations: params.migrations,
    oldMostPath: params.baselinePath,
    checkLimit: params.options.checkLimit,
    exitCode: result.exitCode,
    stderr: result.stderr,
  });
}

export async function runStableCheck(
  params: RunStableCheckParams,
): Promise<void> {
  const {
    baselineMost,
    canisterMain,
    canisterName,
    mocPath,
    globalMocArgs,
    canisterArgs,
    options = {},
  } = params;

  const sources = params.sources ?? (await sourcesArgs()).flat();

  if (!existsSync(baselineMost)) {
    cliError(`File not found: ${baselineMost}`);
  }

  // moc 1.12.0+ → one --check, no scratch dir.
  if (canUseStableBaselineCheck(canisterArgs)) {
    await runFoldedStableCheck({
      canisterMain,
      canisterName,
      mocPath,
      baselinePath: baselineMost,
      sources,
      globalMocArgs,
      canisterArgs,
      migrations: params.migrations,
      options,
    });
    return;
  }

  mkdirSync(CHECK_STABLE_PARENT, { recursive: true });
  const scratchDir = mkdtempSync(
    join(CHECK_STABLE_PARENT, CHECK_STABLE_PREFIX),
  );
  try {
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
        chalk.gray(`Comparing ${baselineMost} ↔ ${newMostPath}`),
      );
    }

    const args = ["--stable-compatible", baselineMost, newMostPath];
    if (options.verbose) {
      console.log(chalk.gray(mocPath, JSON.stringify(args)));
    }

    const result = await execa(mocPath, args, {
      stdio: "pipe",
      reject: false,
    });

    reportStableCheckOutcome(canisterName, {
      migrations: params.migrations,
      oldMostPath: baselineMost,
      checkLimit: options.checkLimit,
      exitCode: result.exitCode,
      stderr: result.stderr,
    });
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
