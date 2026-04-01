import chalk from "chalk";
import { execa } from "execa";
import { exists } from "fs-extra";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lock, unlockSync } from "proper-lockfile";
import { cliError } from "../error.js";
import { isCandidCompatible } from "../helpers/is-candid-compatible.js";
import { resolveCanisterConfigs } from "../helpers/resolve-canisters.js";
import { CanisterConfig, Config } from "../types.js";
import { CustomSection, getWasmBindings } from "../wasm.js";
import { getGlobalMocArgs, readConfig, resolveConfigPath } from "../mops.js";
import { sourcesArgs } from "./sources.js";
import { toolchain } from "./toolchain/index.js";

export interface BuildOptions {
  outputDir: string;
  verbose: boolean;
  extraArgs: string[];
}

export const DEFAULT_BUILD_OUTPUT_DIR = ".mops/.build";

export async function build(
  canisterNames: string[] | undefined,
  options: Partial<BuildOptions>,
): Promise<void> {
  if (canisterNames?.length === 0) {
    cliError("No canisters specified to build");
  }

  let config = readConfig();
  let configOutputDir = config.build?.outputDir
    ? resolveConfigPath(config.build.outputDir)
    : undefined;
  let outputDir =
    options.outputDir ?? configOutputDir ?? DEFAULT_BUILD_OUTPUT_DIR;
  let mocPath = await toolchain.bin("moc", { fallback: true });
  let canisters = resolveCanisterConfigs(config);
  if (!Object.keys(canisters).length) {
    cliError(`No Motoko canisters found in mops.toml configuration`);
  }

  if (canisterNames) {
    let invalidNames = canisterNames.filter((name) => !(name in canisters));
    if (invalidNames.length) {
      cliError(
        `Motoko canister(s) not found in mops.toml configuration: ${invalidNames.join(", ")}`,
      );
    }
  }

  if (!(await exists(outputDir))) {
    await mkdir(outputDir, { recursive: true });
  }

  const filteredCanisters = canisterNames
    ? Object.fromEntries(
        Object.entries(canisters).filter(([name]) =>
          canisterNames.includes(name),
        ),
      )
    : canisters;

  for (let [canisterName, canister] of Object.entries(filteredCanisters)) {
    console.log(chalk.blue("build canister"), chalk.bold(canisterName));
    let motokoPath = canister.main;
    if (!motokoPath) {
      cliError(`No main file is specified for canister ${canisterName}`);
    }
    motokoPath = resolveConfigPath(motokoPath);
    const wasmPath = join(outputDir, `${canisterName}.wasm`);
    const mostPath = join(outputDir, `${canisterName}.most`);

    // per-canister lock to prevent parallel builds of the same canister from clobbering output files
    const sentinelPath = join(outputDir, `.${canisterName}.buildlock`);
    const fd = await open(sentinelPath, "a");
    await fd.close();

    let release: (() => Promise<void>) | undefined;
    try {
      release = await lock(sentinelPath, {
        stale: 300_000,
        retries: { retries: 120, minTimeout: 500, maxTimeout: 5_000 },
      });
    } catch (err: any) {
      if (err.code === "ELOCKED") {
        cliError(
          `Another build of canister ${canisterName} is already in progress`,
        );
      }
      throw err;
    }

    // proper-lockfile's built-in signal-exit cleanup is unreliable with process.exit() —
    // ensure the lock is released synchronously so subsequent builds don't stall
    const exitCleanup = () => {
      try {
        unlockSync(sentinelPath);
      } catch {}
    };
    process.on("exit", exitCleanup);

    try {
      let args = [
        "-c",
        "--idl",
        "--stable-types",
        "-o",
        wasmPath,
        motokoPath,
        ...(await sourcesArgs()).flat(),
        ...getGlobalMocArgs(config),
      ];
      args.push(
        ...collectExtraArgs(config, canister, canisterName, options.extraArgs),
      );

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
      process.removeListener("exit", exitCleanup);
      await release();
    }
  }

  console.log(
    chalk.green(
      `\n✓ Built ${Object.keys(filteredCanisters).length} canister${Object.keys(filteredCanisters).length === 1 ? "" : "s"} successfully`,
    ),
  );
}

const managedFlags: Record<string, string> = {
  "-o": "use [build].outputDir in mops.toml or --output flag instead",
  "-c": "this flag is always set by mops build",
  "--idl": "this flag is always set by mops build",
  "--stable-types": "this flag is always set by mops build",
  "--public-metadata": "this flag is managed by mops build",
};

function collectExtraArgs(
  config: Config,
  canister: CanisterConfig,
  canisterName: string,
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
    if (typeof canister.args === "string") {
      cliError(
        `Canister config 'args' should be an array of strings for canister ${canisterName}`,
      );
    }
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
          `Warning: '${arg}' in args for canister ${canisterName} may conflict with mops build — ${hint}`,
        ),
      );
    }
  }

  return args;
}
