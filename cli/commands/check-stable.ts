import { basename, join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import chalk from "chalk";
import { execa } from "execa";
import { cliError } from "../error.js";
import { getGlobalMocArgs, readConfig, resolveConfigPath } from "../mops.js";
import { CanisterConfig } from "../types.js";
import {
  filterCanisters,
  looksLikeFile,
  resolveCanisterConfigs,
  resolveSingleCanister,
  validateCanisterArgs,
} from "../helpers/resolve-canisters.js";
import { sourcesArgs } from "./sources.js";
import { toolchain } from "./toolchain/index.js";

const CHECK_STABLE_DIR = ".mops/.check-stable";

export interface CheckStableOptions {
  verbose: boolean;
  extraArgs: string[];
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
  if (!existsSync(stablePath)) {
    if (stableConfig.skipIfMissing) {
      return null;
    }
    cliError(
      `Deployed file not found: ${stablePath} (canister '${canisterName}')\n` +
        "Set skipIfMissing = true in [canisters." +
        canisterName +
        ".check-stable] to skip this check when the file is missing.",
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

  if (args.length > 0 && looksLikeFile(args[0]!)) {
    const oldFile = args[0]!;
    const canisterName = args[1];
    const { name, canister } = resolveSingleCanister(config, canisterName);

    if (!canister.main) {
      cliError(`No main file specified for canister '${name}' in mops.toml`);
    }

    validateCanisterArgs(canister, name);

    await runStableCheck({
      oldFile,
      canisterMain: resolveConfigPath(canister.main),
      canisterName: name,
      mocPath,
      globalMocArgs,
      canisterArgs: canister.args ?? [],
      options,
    });
    return;
  }

  const canisters = resolveCanisterConfigs(config);
  const canisterNames = args.length > 0 ? args : undefined;
  const filteredCanisters = filterCanisters(canisters, canisterNames);

  let checked = 0;
  for (const [name, canister] of Object.entries(filteredCanisters)) {
    if (!canister.main) {
      cliError(`No main file specified for canister '${name}' in mops.toml`);
    }

    validateCanisterArgs(canister, name);
    const stablePath = resolveStablePath(canister, name, {
      required: !!canisterNames,
    });
    if (!stablePath) {
      continue;
    }

    await runStableCheck({
      oldFile: stablePath,
      canisterMain: resolveConfigPath(canister.main),
      canisterName: name,
      mocPath,
      globalMocArgs,
      canisterArgs: canister.args ?? [],
      options,
    });
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

  await rm(CHECK_STABLE_DIR, { recursive: true, force: true });
  mkdirSync(CHECK_STABLE_DIR, { recursive: true });
  try {
    const oldMostPath = isOldMostFile
      ? oldFile
      : await generateStableTypes(
          mocPath,
          oldFile,
          join(CHECK_STABLE_DIR, "old.most"),
          sources,
          globalMocArgs,
          canisterArgs,
          options,
        );

    const newMostPath = await generateStableTypes(
      mocPath,
      canisterMain,
      join(CHECK_STABLE_DIR, "new.most"),
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

    if (result.exitCode !== 0) {
      if (result.stderr) {
        console.error(result.stderr);
      }
      cliError(
        `✗ Stable compatibility check failed for canister '${canisterName}'`,
      );
    }

    console.log(
      chalk.green(
        `✓ Stable compatibility check passed for canister '${canisterName}'`,
      ),
    );
  } finally {
    await rm(CHECK_STABLE_DIR, { recursive: true, force: true });
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
  const base = basename(outputPath, ".most");
  const wasmPath = join(CHECK_STABLE_DIR, base + ".wasm");
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
    cliError(
      `Failed to generate stable types for ${moFile} (exit code: ${result.exitCode})`,
    );
  }

  await rm(wasmPath, { force: true });

  return outputPath;
}
