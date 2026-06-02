import { existsSync, mkdirSync } from "node:fs";
import { copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { cliError } from "../error.js";
import {
  filterCanisters,
  resolveCanisterConfigs,
} from "../helpers/resolve-canisters.js";
import {
  getRootDir,
  readConfig,
  resolveConfigPath,
  writeConfig,
} from "../mops.js";
import { Config } from "../types.js";
import { DEFAULT_BUILD_OUTPUT_DIR } from "./build.js";

export const DEFAULT_DEPLOYED_DIR = "deployed";

const EMPTY_ACTOR_MOST = "// Version: 1.0.0\nactor { };\n";

export interface DeployedOptions {
  output?: string;
  dir?: string;
}

export interface DeployedInitOptions {
  dir?: string;
}

// `[deployed].dir` and CLI overrides are tracked in two forms:
//   - `config`: relative to mops.toml, used for display + writing into mops.toml
//   - `resolved`: relative to cwd, used for fs operations
function resolveDeployedDir(
  config: Config,
  override: string | undefined,
): { config: string; resolved: string } {
  if (override) {
    const configRel =
      path.relative(getRootDir(), path.resolve(override)) || ".";
    return { config: configRel, resolved: override };
  }
  const configured = config.deployed?.dir ?? DEFAULT_DEPLOYED_DIR;
  return { config: configured, resolved: resolveConfigPath(configured) };
}

function resolveOutputDir(
  config: Config,
  override: string | undefined,
): string {
  if (override) {
    return override;
  }
  return config.build?.outputDir
    ? resolveConfigPath(config.build.outputDir)
    : DEFAULT_BUILD_OUTPUT_DIR;
}

function pathsEqual(a: string, b: string): boolean {
  return path.resolve(a) === path.resolve(b);
}

export async function deployed(
  canisterNames: string[] | undefined,
  options: DeployedOptions = {},
): Promise<void> {
  if (canisterNames?.length === 0) {
    cliError("No canisters specified");
  }

  const config = readConfig();
  const canisters = resolveCanisterConfigs(config);
  if (!Object.keys(canisters).length) {
    cliError(`No Motoko canisters found in mops.toml configuration`);
  }
  const filtered = filterCanisters(canisters, canisterNames);

  const outputDir = resolveOutputDir(config, options.output);
  const deployedDir = resolveDeployedDir(config, options.dir);

  mkdirSync(deployedDir.resolved, { recursive: true });

  for (const [name, canister] of Object.entries(filtered)) {
    const sourceMost = path.join(outputDir, `${name}.most`);
    const destMost = path.join(deployedDir.resolved, `${name}.most`);

    if (!existsSync(sourceMost)) {
      cliError(
        `No built .most at ${sourceMost}. Run \`mops build ${name}\` first.`,
      );
    }

    await copyFile(sourceMost, destMost);
    console.log(chalk.green(`✓ ${sourceMost} → ${destMost}`));

    const stablePath = canister["check-stable"]?.path;
    if (stablePath && !pathsEqual(resolveConfigPath(stablePath), destMost)) {
      console.warn(
        chalk.yellow(
          `WARN: [canisters.${name}.check-stable].path is "${stablePath}", ` +
            `but mops deployed wrote to "${destMost}". ` +
            `\`mops check-stable\` won't see this update.`,
        ),
      );
    }
  }
}

export async function deployedInit(
  canisterNames: string[] | undefined,
  options: DeployedInitOptions = {},
): Promise<void> {
  if (canisterNames?.length === 0) {
    cliError("No canisters specified");
  }

  const config = readConfig();
  const canisters = resolveCanisterConfigs(config);
  if (!Object.keys(canisters).length) {
    cliError(`No Motoko canisters found in mops.toml configuration`);
  }
  const filtered = filterCanisters(canisters, canisterNames);

  const deployedDir = resolveDeployedDir(config, options.dir);

  mkdirSync(deployedDir.resolved, { recursive: true });

  let configChanged = false;

  for (const [name, canister] of Object.entries(filtered)) {
    const destMostRel = path.join(deployedDir.config, `${name}.most`);
    const destMost = path.join(deployedDir.resolved, `${name}.most`);

    if (!existsSync(destMost)) {
      await writeFile(destMost, EMPTY_ACTOR_MOST);
      console.log(chalk.green(`✓ Created baseline ${destMost}`));
    }

    const stablePath = canister["check-stable"]?.path;
    if (!stablePath) {
      const entry = config.canisters?.[name];
      if (typeof entry === "string") {
        config.canisters![name] = {
          main: entry,
          "check-stable": { path: destMostRel },
        };
      } else if (entry) {
        entry["check-stable"] = { path: destMostRel };
      }
      configChanged = true;
      console.log(
        chalk.green(
          `✓ Set [canisters.${name}.check-stable].path = "${destMostRel}"`,
        ),
      );
    } else if (!pathsEqual(resolveConfigPath(stablePath), destMost)) {
      console.warn(
        chalk.yellow(
          `WARN: [canisters.${name}.check-stable].path is already set to "${stablePath}" — leaving as-is. ` +
            `\`mops deployed\` writes to "${destMostRel}", which won't match the configured baseline.`,
        ),
      );
    }
  }

  if (configChanged) {
    writeConfig(config);
  }
}
