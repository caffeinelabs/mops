import chalk from "chalk";
import { execa } from "execa";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { cliError } from "../error.js";
import {
  filterCanisters,
  resolveCanisterConfigs,
} from "../helpers/resolve-canisters.js";
import {
  GENERATE_CANDID_MANAGED_FLAGS,
  prepareMocArgs,
} from "../helpers/moc-args.js";
import {
  getRootDir,
  readConfig,
  resolveConfigPath,
  writeConfig,
} from "../mops.js";
import { CanisterConfig } from "../types.js";
import { toolchain } from "./toolchain/index.js";

export interface GenerateCandidOptions {
  output?: string;
  verbose?: boolean;
  extraArgs?: string[];
}

export async function generateCandid(
  canisterNames: string[] | undefined,
  options: GenerateCandidOptions,
): Promise<void> {
  if (canisterNames?.length === 0) {
    cliError("No canisters specified");
  }

  const config = readConfig();
  const canisters = resolveCanisterConfigs(config);
  if (!Object.keys(canisters).length) {
    cliError("No Motoko canisters found in mops.toml configuration");
  }

  const filtered = filterCanisters(canisters, canisterNames);
  const filteredEntries = Object.entries(filtered);

  if (options.output && filteredEntries.length > 1) {
    cliError(
      "--output / -o is only supported when generating for a single canister",
    );
  }

  const mocPath = await toolchain.bin("moc", { fallback: true });
  const rootDir = getRootDir();

  let configChanged = false;

  for (const [canisterName, canister] of filteredEntries) {
    const dest = resolveDestination(
      canisterName,
      canister,
      canisters,
      options.output,
      rootDir,
    );

    console.log(
      chalk.blue("generate candid"),
      chalk.bold(canisterName),
      chalk.gray(`→ ${dest.fsPath}`),
    );

    const prepared = await prepareMocArgs(config, canister, canisterName, {
      mode: "build",
      managedFlags: GENERATE_CANDID_MANAGED_FLAGS,
      commandName: "mops generate candid",
      verbose: options.verbose,
      extraArgs: options.extraArgs,
    });

    try {
      await mkdir(path.dirname(dest.fsPath), { recursive: true });
      const args = [
        "--idl",
        "-o",
        dest.fsPath,
        prepared.motokoPath,
        ...prepared.args,
      ];
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
            console.error(chalk.yellow("Output:"));
            console.error(result.stdout);
          }
        }
        cliError(
          `Failed to generate Candid for canister ${canisterName} (exit code: ${result.exitCode})`,
        );
      }

      if (dest.configPath !== null) {
        const c = (config.canisters ??= {});
        const existing = c[canisterName];
        const obj: CanisterConfig =
          typeof existing === "string"
            ? { main: existing }
            : { ...(existing ?? {}) };
        obj.candid = dest.configPath;
        c[canisterName] = obj;
        configChanged = true;
      }
    } finally {
      await prepared.cleanup();
    }
  }

  if (configChanged) {
    writeConfig(config);
  }

  console.log(
    chalk.green(
      `\n✓ Generated Candid for ${filteredEntries.length} canister${filteredEntries.length === 1 ? "" : "s"}`,
    ),
  );
}

interface Destination {
  /** Path used for filesystem operations and passed to moc (cwd-relative or absolute). */
  fsPath: string;
  /** Value to write into `[canisters.<name>].candid` (project-root-relative). `null` skips the config update. */
  configPath: string | null;
}

function resolveDestination(
  canisterName: string,
  canister: CanisterConfig,
  allCanisters: Record<string, CanisterConfig>,
  outputFlag: string | undefined,
  rootDir: string,
): Destination {
  if (!canister.main) {
    cliError(`No main file is specified for canister ${canisterName}`);
  }

  let fsPath: string;
  let configPath: string | null;

  if (outputFlag) {
    fsPath = outputFlag;
    configPath = null;

    const outAbs = path.resolve(fsPath);
    for (const [otherName, other] of Object.entries(allCanisters)) {
      if (otherName === canisterName || !other.candid) {
        continue;
      }
      if (path.resolve(rootDir, other.candid) === outAbs) {
        console.warn(
          chalk.yellow(
            `Warning: --output path collides with [canisters.${otherName}].candid (${other.candid}). Sharing a .did between canisters is almost always a mistake.`,
          ),
        );
      }
    }
  } else if (canister.candid) {
    fsPath = resolveConfigPath(canister.candid);
    configPath = null;
  } else {
    // Default: <dirname(main)>/<canisterName>.did, forward slashes for the toml value
    const mainDir = path.dirname(canister.main).replace(/\\/g, "/");
    const projectRel =
      mainDir === "." || mainDir === ""
        ? `${canisterName}.did`
        : `${mainDir}/${canisterName}.did`;
    fsPath = resolveConfigPath(projectRel);
    configPath = projectRel;
  }

  const absPath = path.resolve(fsPath);
  const dotMopsDir = path.resolve(rootDir, ".mops");
  if (absPath === dotMopsDir || absPath.startsWith(dotMopsDir + path.sep)) {
    cliError(
      `Refusing to write Candid file inside .mops/ (private build cache): ${fsPath}\n` +
        "Choose a path outside .mops/ — it should be committable and readable by downstream tooling.",
    );
  }

  return { fsPath, configPath };
}
