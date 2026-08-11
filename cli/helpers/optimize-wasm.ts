import path from "node:path";
import fs from "fs-extra";
import chalk from "chalk";
import { execa } from "execa";

import { readConfig } from "../mops.js";
import type { Config } from "../types.js";
import { cliError } from "../error.js";
import { toolchain } from "../commands/toolchain/index.js";
import {
  formatOptimizePipeline,
  isOptimizeEnabled,
  resolveOptimizeConfig,
} from "./optimize-config.js";

export {
  formatOptimizePipeline,
  isOptimizeEnabled,
  resolveOptimizeConfig,
} from "./optimize-config.js";
export type { OptimizeResolved } from "./optimize-config.js";

function resolveOptimizeConfigOrExit(config: Config) {
  try {
    return resolveOptimizeConfig(config);
  } catch (err: any) {
    cliError(err?.message ?? String(err));
  }
}

/**
 * Validate the `[optimize]` settings and the `wasm-opt` pin without compiling
 * anything, so a misconfigured project fails before the first canister builds.
 */
export function checkOptimizeConfig(config: Config = readConfig()): void {
  if (!isOptimizeEnabled(config)) {
    return;
  }
  resolveOptimizeConfigOrExit(config);
  requireWasmOptPin(config);
}

/**
 * The pinned Binaryen version, or null when `[optimize]` is absent. Resolving a
 * version here rather than pinning one would mean a build command writing
 * mops.toml and asking GitHub for the latest release.
 */
export function requireWasmOptPin(
  config: Config = readConfig(),
): string | null {
  if (!isOptimizeEnabled(config)) {
    return null;
  }
  let pinned = config.toolchain?.["wasm-opt"];
  if (!pinned) {
    cliError(
      "[optimize] is enabled but wasm-opt is not pinned in [toolchain].\n" +
        "Run `mops toolchain use wasm-opt 131` (or another version), or drop [optimize] from mops.toml.\n" +
        "Pass --no-optimize to skip the pass for a single run.",
    );
  }
  return pinned;
}

// Failing rather than shipping the unoptimized module: `[optimize]` is a
// property of the artifact, and silently producing a different one leaves no
// signal for anything downstream that hashes or certifies the output.
function failOptimize(wasmPath: string, detail?: string): never {
  cliError(
    `Failed to optimize ${path.basename(wasmPath)} with wasm-opt` +
      (detail?.trim() ? `\n${detail.trim()}` : ""),
  );
}

export type OptimizeWasmOptions = {
  verbose?: boolean;
  /** `false` force-disables the pass (e.g. `--no-optimize`), even if `[optimize]` is set. */
  optimize?: boolean;
};

/** Run wasm-opt on a Wasm file in place when `[optimize]` is enabled. */
export async function optimizeWasm(
  wasmPath: string,
  config: Config = readConfig(),
  options: OptimizeWasmOptions = {},
): Promise<boolean> {
  if (options.optimize === false) {
    return false;
  }
  let resolved = resolveOptimizeConfigOrExit(config);
  if (!resolved) {
    return false;
  }

  requireWasmOptPin(config);
  let wasmOptBin = await toolchain.bin("wasm-opt");

  let tmpPath = `${wasmPath}.opt`;
  let args = [
    `-${resolved.level}`,
    ...(resolved.keepNames ? ["-g"] : []),
    ...resolved.args,
    wasmPath,
    "-o",
    tmpPath,
  ];

  if (options.verbose) {
    console.log(chalk.gray(`${wasmOptBin} ${args.join(" ")}`));
  }

  try {
    let result = await execa(wasmOptBin, args, {
      reject: false,
      all: true,
    });
    if (result.exitCode !== 0) {
      await fs.remove(tmpPath).catch(() => {});
      failOptimize(wasmPath, options.verbose ? result.all : result.stderr);
    }
    await fs.move(tmpPath, wasmPath, { overwrite: true });
    console.log(
      chalk.gray(
        `Optimized ${path.basename(wasmPath)} (${formatOptimizePipeline(config)})`,
      ),
    );
    return true;
  } catch (err: any) {
    await fs.remove(tmpPath).catch(() => {});
    failOptimize(wasmPath, err?.message);
  }
}
