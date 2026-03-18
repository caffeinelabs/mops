import chalk from "chalk";
import { execa } from "execa";
import { exists } from "fs-extra";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, parse } from "node:path";
import { cliError } from "../error.js";
import { isCandidCompatible } from "../helpers/is-candid-compatible.js";
import { resolveCanisterConfigs } from "../helpers/resolve-canisters.js";
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
  if (canisterNames?.length == 0) {
    cliError("No canisters specified to build");
  }

  let outputDir = options.outputDir ?? DEFAULT_BUILD_OUTPUT_DIR;
  let mocPath = await toolchain.bin("moc", { fallback: true });
  let config = readConfig();
  let canisters = resolveCanisterConfigs(config);
  if (!Object.keys(canisters).length) {
    cliError(`No Motoko canisters found in mops.toml configuration`);
  }

  if (canisterNames) {
    canisterNames = canisterNames.filter((name) => name in canisters);
    if (canisterNames.length === 0) {
      throw new Error("No valid canister names specified");
    }
    for (let name of canisterNames) {
      if (!(name in canisters)) {
        cliError(
          `Motoko canister '${name}' not found in mops.toml configuration`,
        );
      }
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
    let wasmPath = join(outputDir, `${canisterName}.wasm`);
    let args = [
      "-c",
      "--idl",
      "-o",
      wasmPath,
      motokoPath,
      ...(await sourcesArgs()).flat(),
      ...getGlobalMocArgs(config),
    ];
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
    args.push(...(options.extraArgs ?? []));

    // moc uses the last -o value; if user args override it, update our paths
    for (let i = args.length - 1; i >= 0; i--) {
      if (args[i] === "-o" && i + 1 < args.length) {
        wasmPath = args[i + 1]!;
        break;
      }
    }

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

      const { dir: wasmDir, name: wasmBaseName } = parse(wasmPath);
      const generatedDidPath = join(wasmDir, `${wasmBaseName}.did`);
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
  }

  console.log(
    chalk.green(
      `\n✓ Built ${Object.keys(filteredCanisters).length} canister${Object.keys(filteredCanisters).length == 1 ? "" : "s"} successfully`,
    ),
  );
}
