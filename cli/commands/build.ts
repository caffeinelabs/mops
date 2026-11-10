import chalk from "chalk";
import { execa } from "execa";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { lock } from "proper-lockfile";
import { CliError, cliError, cliErrorFrom, cliExit } from "../error.js";
import { describeExecFailure } from "../helpers/exec-failure.js";
import { checkCandidCompatibility } from "../helpers/candid-compatibility.js";
import { getPocketIcUrl } from "../helpers/pocket-ic-startup.js";
import {
  filterCanisters,
  resolveCanisterConfigs,
} from "../helpers/resolve-canisters.js";
import { BUILD_MANAGED_FLAGS, prepareMocArgs } from "../helpers/moc-args.js";
import { checkOptimizeConfig, optimizeWasm } from "../helpers/optimize-wasm.js";
import type { CheckDeployArtifact } from "../helpers/check-deploy.js";
import { runWasmComplexityPreflight } from "../helpers/wasm-complexity.js";
import { replaceCandidService } from "../helpers/wasm-metadata.js";
import { readConfig, resolveConfigPath } from "../mops.js";
import { Config } from "../types.js";
import {
  canUseStableBaselineCheck,
  requireMostBaseline,
  resolveStablePath,
} from "./check-stable.js";
import { toolchain } from "./toolchain/index.js";

export interface BuildOptions {
  outputDir: string;
  verbose: boolean;
  checkWasm: boolean;
  checkDeploy: boolean;
  /** `false` skips the `[optimize]` wasm-opt pass (`--no-optimize`). */
  optimize: boolean;
  extraArgs: string[];
}

export const DEFAULT_BUILD_OUTPUT_DIR = ".mops/.build";

/**
 * Resolve the build output directory: the CLI override as given (relative to
 * the current directory), else `[build].outputDir` or the default, both
 * relative to the project root.
 */
export function resolveBuildOutputDir(
  config: Config,
  override?: string,
): string {
  if (override) {
    return override;
  }
  return resolveConfigPath(config.build?.outputDir ?? DEFAULT_BUILD_OUTPUT_DIR);
}

export async function build(
  canisterNames: string[] | undefined,
  options: Partial<BuildOptions>,
): Promise<void> {
  if (canisterNames?.length === 0) {
    cliError("No canisters specified to build");
  }

  let config = readConfig();
  const checkWasmEnabled =
    options.checkWasm ?? config.build?.["check-wasm"] ?? false;
  const checkDeployEnabled =
    options.checkDeploy ?? config.build?.["check-deploy"] ?? false;
  let outputDir = resolveBuildOutputDir(config, options.outputDir);
  let canisters = resolveCanisterConfigs(config);
  if (!Object.keys(canisters).length) {
    cliError(`No Motoko canisters found in mops.toml configuration`);
  }
  if (options.optimize !== false) {
    checkOptimizeConfig(config);
  }
  let mocPath = await toolchain.bin("moc");
  // Fail on a missing pin before compiling anything, like `[optimize]` does.
  if (checkDeployEnabled && !getPocketIcUrl()) {
    await toolchain.bin("pocket-ic");
  }

  await mkdir(outputDir, { recursive: true });

  const filteredCanisters = filterCanisters(canisters, canisterNames);
  const checkDeployArtifacts: CheckDeployArtifact[] = [];

  for (let [canisterName, canister] of Object.entries(filteredCanisters)) {
    console.log(chalk.blue("build canister"), chalk.bold(canisterName));
    const wasmPath = join(outputDir, `${canisterName}.wasm`);
    const mostPath = join(outputDir, `${canisterName}.most`);

    // Keeps parallel builds of one canister from clobbering its output files.
    // `realpath: false` lets the wasm not exist yet; the lock is `<wasm>.lock`.
    let release: (() => Promise<void>) | undefined;
    try {
      release = await lock(wasmPath, {
        realpath: false,
        stale: 300_000,
        retries: { retries: 60, minTimeout: 500, maxTimeout: 5_000 },
      });
    } catch {
      cliError(
        `Failed to acquire build lock for canister ${canisterName} — another build may be stuck`,
      );
    }

    let prepared: Awaited<ReturnType<typeof prepareMocArgs>> | undefined;
    try {
      prepared = await prepareMocArgs(config, canister, canisterName, {
        mode: "build",
        managedFlags: BUILD_MANAGED_FLAGS,
        commandName: "mops build",
        verbose: options.verbose,
        extraArgs: options.extraArgs,
      });

      const stableConfigPath = canister["check-stable"]?.path;
      if (stableConfigPath) {
        requireMostBaseline(
          stableConfigPath,
          `[canisters.${canisterName}.check-stable].path`,
        );
      }
      // Only migration builds take a baseline (moc 1.15+, --enhanced-migration).
      // A configured baseline is a gate: a missing file fails the build, as in
      // `mops check` and `mops check-stable`.
      const stableBaseline = canUseStableBaselineCheck(prepared.args)
        ? resolveStablePath(canister, canisterName)
        : null;

      let args = [
        "-c",
        "--idl",
        "--stable-types",
        "-o",
        wasmPath,
        prepared.motokoPath,
        ...(stableBaseline ? ["--stable-baseline", stableBaseline] : []),
        ...prepared.args,
      ];

      args.push("--public-metadata", "candid:service");
      args.push("--public-metadata", "candid:args");
      const generatedDidPath = join(outputDir, `${canisterName}.did`);
      try {
        // Outputs of an earlier build must not pass for this one's. A
        // baseline that is this build's own `.most` stays for moc to read.
        await Promise.all(
          [wasmPath, generatedDidPath, mostPath]
            .filter(
              (p) => !stableBaseline || resolve(p) !== resolve(stableBaseline),
            )
            .map((p) => rm(p, { force: true })),
        );
        if (options.verbose) {
          console.log(chalk.gray(mocPath, JSON.stringify(args)));
        }
        const result = await execa(mocPath, args, {
          stdio: options.verbose ? "inherit" : "pipe",
          reject: false,
        });

        if (result.exitCode !== 0) {
          if (!options.verbose) {
            if (result.stderr) {
              console.error(chalk.red(result.stderr));
            }
            if (result.stdout?.trim()) {
              console.error(chalk.yellow("Build output:"));
              console.error(result.stdout);
            }
          }
          cliExit(
            result.exitCode ?? 1,
            `Build failed for canister ${canisterName} (${describeExecFailure(result)})`,
          );
        }

        if (options.verbose && result.stdout && result.stdout.trim()) {
          console.log(result.stdout);
        }
        // An `-o` in the canister's moc args sends the Wasm elsewhere.
        if (!existsSync(wasmPath)) {
          cliError(
            `moc did not write ${wasmPath} for canister ${canisterName}. Remove -o from the moc args and use --output or [build].outputDir instead.`,
          );
        }

        options.verbose &&
          console.log(chalk.gray(`Stable types written to ${mostPath}`));

        const resolvedCandidPath = canister.candid
          ? resolveConfigPath(canister.candid)
          : null;

        // moc already embeds `candid:service` and `candid:args` generated from
        // source. Only a declared interface file needs checking and swapping in.
        if (resolvedCandidPath) {
          const incompatibility = await checkCandidCompatibility(
            generatedDidPath,
            resolvedCandidPath,
          );
          if (incompatibility) {
            cliError(
              `Candid compatibility check failed for canister ${canisterName}\n${incompatibility}`,
            );
          }
          options.verbose &&
            console.log(
              chalk.gray(
                `Candid compatibility check passed for canister ${canisterName}`,
              ),
            );

          const curated = replaceCandidService(
            await readFile(wasmPath),
            await readFile(resolvedCandidPath, "utf-8"),
          );
          if (curated) {
            await writeFile(wasmPath, curated);
            options.verbose &&
              console.log(
                chalk.gray(
                  `Embedded ${resolvedCandidPath} as candid:service in ${wasmPath}`,
                ),
              );
          } else {
            console.warn(
              chalk.yellow(
                `Warning: ${wasmPath} has no candid:service section (--omit-metadata candid:service?), so ${resolvedCandidPath} is not embedded`,
              ),
            );
          }
        }
        await optimizeWasm(wasmPath, config, {
          verbose: options.verbose,
          optimize: options.optimize,
        });
        if (checkWasmEnabled) {
          runWasmComplexityPreflight(canisterName, await readFile(wasmPath), {
            checkDeployEnabled,
          });
        }
        if (checkDeployEnabled) {
          // Init args must be encoded against the Motoko-generated init
          // signature. A declared candid file is typically service-only and
          // has no init types.
          checkDeployArtifacts.push({
            name: canisterName,
            wasmPath,
            mostPath,
            initCandid: await readFile(generatedDidPath, "utf-8"),
            initArg: canister.initArg,
            wasmMemoryLimit: canister.wasmMemoryLimit,
          });
        }
      } catch (err) {
        cliErrorFrom(err, `Error while compiling canister ${canisterName}`);
      }
    } finally {
      await prepared?.cleanup();
      try {
        await release?.();
      } catch {}
    }
  }

  if (checkDeployEnabled) {
    try {
      const { checkDeploy } = await import("../helpers/check-deploy.js");
      await checkDeploy(checkDeployArtifacts, {
        verbose: options.verbose,
        mocPath,
      });
    } catch (err) {
      if (err instanceof CliError) {
        throw err;
      }
      cliError(err instanceof Error ? err.message : String(err));
    }
  }

  console.log(
    chalk.green(
      `\n✓ Built ${Object.keys(filteredCanisters).length} canister${Object.keys(filteredCanisters).length === 1 ? "" : "s"} successfully`,
    ),
  );
}
