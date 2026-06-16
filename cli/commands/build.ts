import chalk from "chalk";
import { execa } from "execa";
import { exists } from "fs-extra";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lock, unlockSync } from "proper-lockfile";
import { cliError } from "../error.js";
import { isCandidCompatible } from "../helpers/is-candid-compatible.js";
import {
  filterCanisters,
  resolveCanisterConfigs,
} from "../helpers/resolve-canisters.js";
import { BUILD_MANAGED_FLAGS, prepareMocArgs } from "../helpers/moc-args.js";
import { CustomSection, getWasmBindings } from "../wasm.js";
import { readConfig, resolveConfigPath } from "../mops.js";
import { Config } from "../types.js";
import { toolchain } from "./toolchain/index.js";

export interface BuildOptions {
  outputDir: string;
  verbose: boolean;
  extraArgs: string[];
}

export const DEFAULT_BUILD_OUTPUT_DIR = ".mops/.build";

/**
 * Resolve the build output directory: CLI override → `[build].outputDir`
 * (project-root-relative, resolved via `resolveConfigPath`) → default.
 */
export function resolveBuildOutputDir(
  config: Config,
  override?: string,
): string {
  if (override) {
    return override;
  }
  return config.build?.outputDir
    ? resolveConfigPath(config.build.outputDir)
    : DEFAULT_BUILD_OUTPUT_DIR;
}

export async function build(
  canisterNames: string[] | undefined,
  options: Partial<BuildOptions>,
): Promise<void> {
  if (canisterNames?.length === 0) {
    cliError("No canisters specified to build");
  }

  let config = readConfig();
  let outputDir = resolveBuildOutputDir(config, options.outputDir);
  let mocPath = await toolchain.bin("moc", { fallback: true });
  let canisters = resolveCanisterConfigs(config);
  if (!Object.keys(canisters).length) {
    cliError(`No Motoko canisters found in mops.toml configuration`);
  }

  if (!(await exists(outputDir))) {
    await mkdir(outputDir, { recursive: true });
  }

  const filteredCanisters = filterCanisters(canisters, canisterNames);

  for (let [canisterName, canister] of Object.entries(filteredCanisters)) {
    console.log(chalk.blue("build canister"), chalk.bold(canisterName));
    const wasmPath = join(outputDir, `${canisterName}.wasm`);
    const mostPath = join(outputDir, `${canisterName}.most`);

    // per-canister lock to prevent parallel builds of the same canister from clobbering output files
    const lockTarget = join(outputDir, `.${canisterName}.buildlock`);
    await writeFile(lockTarget, "", { flag: "a" });

    let release: (() => Promise<void>) | undefined;
    try {
      release = await lock(lockTarget, {
        stale: 300_000,
        retries: { retries: 60, minTimeout: 500, maxTimeout: 5_000 },
      });
    } catch {
      cliError(
        `Failed to acquire build lock for canister ${canisterName} — another build may be stuck`,
      );
    }

    // proper-lockfile registers its own signal-exit handler, but it doesn't reliably
    // fire on process.exit(). This manual handler covers that gap. Double-unlock is
    // harmless (the second call throws and is caught).
    const exitCleanup = () => {
      try {
        unlockSync(lockTarget);
      } catch {}
    };
    process.on("exit", exitCleanup);

    const prepared = await prepareMocArgs(config, canister, canisterName, {
      mode: "build",
      managedFlags: BUILD_MANAGED_FLAGS,
      commandName: "mops build",
      verbose: options.verbose,
      extraArgs: options.extraArgs,
    });
    try {
      let args = [
        "-c",
        "--idl",
        "--stable-types",
        "-o",
        wasmPath,
        prepared.motokoPath,
        ...prepared.args,
      ];

      const isPublicCandid = true; // always true for now to reduce corner cases
      const candidVisibility = isPublicCandid ? "icp:public" : "icp:private";
      if (isPublicCandid) {
        args.push("--public-metadata", "candid:service");
        args.push("--public-metadata", "candid:args");
      }
      try {
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
          cliError(
            `Build failed for canister ${canisterName} (exit code: ${result.exitCode})`,
          );
        }

        if (options.verbose && result.stdout && result.stdout.trim()) {
          console.log(result.stdout);
        }

        options.verbose &&
          console.log(chalk.gray(`Stable types written to ${mostPath}`));

        const generatedDidPath = join(outputDir, `${canisterName}.did`);
        const resolvedCandidPath = canister.candid
          ? resolveConfigPath(canister.candid)
          : null;

        if (resolvedCandidPath) {
          try {
            const compatible = await isCandidCompatible(
              generatedDidPath,
              resolvedCandidPath,
            );

            if (!compatible) {
              cliError(
                `Candid compatibility check failed for canister ${canisterName}`,
              );
            }

            if (options.verbose) {
              console.log(
                chalk.gray(
                  `Candid compatibility check passed for canister ${canisterName}`,
                ),
              );
            }
          } catch (err: any) {
            cliError(
              `Error during Candid compatibility check for canister ${canisterName}${err?.message ? `\n${err.message}` : ""}`,
            );
          }
        }

        options.verbose &&
          console.log(chalk.gray(`Adding metadata to ${wasmPath}`));
        const candidPath = resolvedCandidPath ?? generatedDidPath;
        const candidText = await readFile(candidPath, "utf-8");
        const customSections: CustomSection[] = [
          { name: `${candidVisibility} candid:service`, data: candidText },
        ];
        if (canister.initArg) {
          customSections.push({
            name: `${candidVisibility} candid:args`,
            data: canister.initArg,
          });
        }
        const wasmBytes = await readFile(wasmPath);
        const newWasm = getWasmBindings().add_custom_sections(
          wasmBytes,
          customSections,
        );
        await writeFile(wasmPath, newWasm);
      } catch (err: any) {
        if (err.message?.includes("Build failed for canister")) {
          throw err;
        }
        cliError(
          `Error while compiling canister ${canisterName}${err?.message ? `\n${err.message}` : ""}`,
        );
      }
    } finally {
      await prepared.cleanup();
      process.removeListener("exit", exitCleanup);
      try {
        await release?.();
      } catch {}
    }
  }

  console.log(
    chalk.green(
      `\n✓ Built ${Object.keys(filteredCanisters).length} canister${Object.keys(filteredCanisters).length === 1 ? "" : "s"} successfully`,
    ),
  );
}
