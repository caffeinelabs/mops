import path from "node:path";
import fs from "fs-extra";
import chalk from "chalk";
import { execa } from "execa";

import { readConfig, writeConfig, getClosestConfigFile } from "../mops.js";
import type { Config } from "../types.js";
import { cliError } from "../error.js";
import { toolchain } from "../commands/toolchain/index.js";
import { getLatestReleaseTag } from "../commands/toolchain/wasm-opt.js";
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
 * If `[optimize]` is on and `[toolchain].wasm-opt` is missing, pin the latest
 * Binaryen release into mops.toml and return its version.
 */
export async function ensureWasmOptPinned(
  config: Config = readConfig(),
  { verbose = false } = {},
): Promise<string | null> {
  if (!isOptimizeEnabled(config)) {
    return null;
  }
  let existing = config.toolchain?.["wasm-opt"];
  if (existing) {
    return existing;
  }
  let version = await getLatestReleaseTag();
  config.toolchain = { ...config.toolchain, "wasm-opt": version };
  writeConfig(config);
  console.log(
    chalk.yellow(
      `Pinned wasm-opt ${version} in ${path.basename(getClosestConfigFile())} ([optimize] enabled)`,
    ),
  );
  if (verbose) {
    console.log(chalk.gray(`  [toolchain] wasm-opt = "${version}"`));
  }
  return version;
}

export type OptimizeWasmOptions = {
  verbose?: boolean;
  /** `false` force-disables the pass (e.g. `--no-optimize`), even if `[optimize]` is set. */
  optimize?: boolean;
};

/**
 * Run wasm-opt on a Wasm file in place when `[optimize]` is enabled.
 * On failure: warn and leave the unoptimized file.
 */
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

  await ensureWasmOptPinned(config, { verbose: options.verbose });
  // Re-read in case auto-pin wrote toolchain; callers may pass a stale object.
  config = readConfig();
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
      console.warn(
        chalk.yellow(
          `Failed to optimize ${path.basename(wasmPath)} with wasm-opt; using unoptimized Wasm`,
        ),
      );
      if (options.verbose && result.all) {
        console.warn(chalk.gray(result.all));
      } else if (result.stderr) {
        console.warn(chalk.gray(result.stderr.trim()));
      }
      await fs.remove(tmpPath).catch(() => {});
      return false;
    }
    await fs.move(tmpPath, wasmPath, { overwrite: true });
    console.log(
      chalk.gray(
        `Optimized ${path.basename(wasmPath)} (${formatOptimizePipeline(config)})`,
      ),
    );
    return true;
  } catch (err: any) {
    console.warn(
      chalk.yellow(
        `Failed to optimize ${path.basename(wasmPath)} with wasm-opt; using unoptimized Wasm`,
      ),
    );
    if (options.verbose && err?.message) {
      console.warn(chalk.gray(err.message));
    }
    await fs.remove(tmpPath).catch(() => {});
    return false;
  }
}
