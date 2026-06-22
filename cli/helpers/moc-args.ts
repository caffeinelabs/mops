import chalk from "chalk";
import { CanisterConfig, Config } from "../types.js";
import { cliError } from "../error.js";
import { getGlobalMocArgs, resolveConfigPath } from "../mops.js";
import { sourcesArgs } from "../commands/sources.js";
import { prepareMigrationArgs } from "./migrations.js";
import { validateCanisterArgs } from "./resolve-canisters.js";

/** Single source of truth for "how moc is invoked for canister X" — keeps
 * `mops build` and `mops generate candid` in lockstep so the auto-generated
 * `.did` they each produce stays subtype-compatible with the curated one
 * embedded by `mops build`. */
export interface PrepareMocArgsOptions {
  /** Selects the migration trim limit (`build-limit` vs `check-limit`). */
  mode: "check" | "build";
  /** Per-flag hints used when warning about conflicting `args` entries. */
  managedFlags: Record<string, string>;
  /** Command label shown in the warning, e.g. "mops build". */
  commandName: string;
  verbose?: boolean;
  extraArgs?: string[];
}

export interface PreparedMocArgs {
  motokoPath: string;
  /** sources + [moc].args + migration + [build].args + [canisters.x].args + CLI extras. */
  args: string[];
  /** Cleans up the migration staging dir; call from a `finally`. */
  cleanup: () => Promise<void>;
}

export const BUILD_MANAGED_FLAGS: Record<string, string> = {
  "-o": "use [build].outputDir in mops.toml or --output flag instead",
  "-c": "this flag is always set by mops build",
  "--idl": "this flag is always set by mops build",
  "--stable-types": "this flag is always set by mops build",
  "--public-metadata": "this flag is managed by mops build",
};

export const GENERATE_CANDID_MANAGED_FLAGS: Record<string, string> = {
  "-o": "use the --output flag on `mops generate candid` instead",
  "-c": "this flag is incompatible with mops generate candid (would also emit .wasm)",
  "--idl": "this flag is always set by mops generate candid",
  "--stable-types":
    "this flag is incompatible with mops generate candid (would also emit .most)",
};

export async function prepareMocArgs(
  config: Config,
  canister: CanisterConfig,
  canisterName: string,
  options: PrepareMocArgsOptions,
): Promise<PreparedMocArgs> {
  if (!canister.main) {
    cliError(`No main file is specified for canister ${canisterName}`);
  }
  const motokoPath = resolveConfigPath(canister.main);

  const migration = await prepareMigrationArgs(
    canister.migrations,
    canisterName,
    options.mode,
    options.verbose,
  );

  const args = [
    ...(await sourcesArgs()).flat(),
    ...getGlobalMocArgs(config),
    ...migration.migrationArgs,
    ...collectExtraArgs(
      config,
      canister,
      canisterName,
      options.managedFlags,
      options.commandName,
      options.extraArgs,
    ),
  ];

  return { motokoPath, args, cleanup: migration.cleanup };
}

function collectExtraArgs(
  config: Config,
  canister: CanisterConfig,
  canisterName: string,
  managedFlags: Record<string, string>,
  commandName: string,
  extraArgs?: string[],
): string[] {
  const args: string[] = [];

  if (config.build?.args) {
    if (typeof config.build.args === "string") {
      cliError(
        `[build] config 'args' should be an array of strings in mops.toml config file`,
      );
    }
    args.push(...config.build.args);
  }
  if (canister.args) {
    validateCanisterArgs(canister, canisterName, config);
    args.push(...canister.args);
  }
  if (extraArgs) {
    args.push(...extraArgs);
  }

  const warned = new Set<string>();
  for (const arg of args) {
    const hint = managedFlags[arg];
    if (hint && !warned.has(arg)) {
      warned.add(arg);
      console.warn(
        chalk.yellow(
          `Warning: '${arg}' in args for canister ${canisterName} may conflict with ${commandName} — ${hint}`,
        ),
      );
    }
  }

  return args;
}
