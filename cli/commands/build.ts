import chalk from "chalk";
import { execa } from "execa";
import { exists } from "fs-extra";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getMocPath } from "../helpers/get-moc-path.js";
import { readConfig } from "../mops.js";
import { CanisterConfig } from "../types.js";
import { sourcesArgs } from "./sources.js";

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
    throw new Error("No canisters specified to build");
  }

  let outputDir = options.outputDir ?? DEFAULT_BUILD_OUTPUT_DIR;
  let mocPath = getMocPath();
  let canisters: Record<string, CanisterConfig> = {};
  let config = readConfig();
  if (config.canisters) {
    canisters =
      Object.fromEntries(
        Object.entries(config.canisters).map(([name, c]) =>
          typeof c === "string" ? [name, { main: c }] : [name, c],
        ),
      ) ?? {};
  }
  if (!Object.keys(canisters).length) {
    throw new Error(`No Motoko canisters found in mops.toml configuration`);
  }

  if (canisterNames) {
    canisterNames = canisterNames.filter((name) => name in canisters);
    if (canisterNames.length === 0) {
      throw new Error("No valid canister names specified");
    }
    for (let name of canisterNames) {
      if (!(name in canisters)) {
        throw new Error(
          `Motoko canister '${name}' not found in mops.toml configuration`,
        );
      }
    }
  }

  if (!(await exists(outputDir))) {
    await mkdir(outputDir, { recursive: true });
  }
  for (let [canisterName, canister] of Object.entries(canisters)) {
    options.verbose && console.time(`build canister ${canisterName}`);
    console.log(chalk.blue("build canister"), chalk.bold(canisterName));
    let motokoPath = canister.main;
    if (!motokoPath) {
      throw new Error(`No main file is specified for canister ${canisterName}`);
    }
    let args = [
      "-c",
      "--idl",
      "-o",
      join(outputDir, `${canisterName}.wasm`),
      motokoPath,
      ...(options.extraArgs ?? []),
      ...(await sourcesArgs()).flat(),
    ];
    if (config.build?.args) {
      if (typeof config.build.args === "string") {
        throw new Error(
          `[build] config 'args' should be an array of strings in mops.toml config file`,
        );
      }
      args.push(...config.build.args);
    }
    if (canister.args) {
      if (typeof canister.args === "string") {
        throw new Error(
          `Canister config 'args' should be an array of strings for canister ${canisterName}`,
        );
      }
      args.push(...canister.args);
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
        console.error(
          chalk.red(`Error: Failed to build canister ${canisterName}`),
        );
        if (!options.verbose) {
          if (result.stderr) {
            console.error(chalk.red(result.stderr));
          }
          if (result.stdout?.trim()) {
            console.error(chalk.yellow("Build output:"));
            console.error(result.stdout);
          }
        }
        // throw new Error(
        //   `Build failed for canister ${canisterName} (exit code: ${result.exitCode})`,
        // );
        process.exit(1);
      }

      if (options.verbose && result.stdout && result.stdout.trim()) {
        console.log(result.stdout);
      }
    } catch (error: any) {
      if (error.message?.includes("Build failed for canister")) {
        throw error;
      }
      console.error(
        chalk.red(`Error while compiling canister ${canisterName}`),
      );
      if (error.message) {
        console.error(chalk.red(`Details: ${error.message}`));
      }

      throw new Error(`Build execution failed for canister ${canisterName}`);
    }
    options.verbose && console.timeEnd(`build canister ${canisterName}`);
  }

  console.log(
    chalk.green(`\n✓ Built ${Object.keys(canisters).length} canisters`),
  );
}
