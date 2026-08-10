import process from "node:process";
import path from "node:path";
import chalk from "chalk";
import prompts from "prompts";
import { createLogUpdate } from "log-update";
import {
  checkConfigFile,
  getClosestConfigFile,
  globalCacheDir,
  readConfig,
  writeConfig,
} from "../../mops.js";
import { Tool } from "../../types.js";
import { checkRequirements } from "../../check-requirements.js";
import * as moc from "./moc.js";
import * as pocketIc from "./pocket-ic.js";
import * as wasmtime from "./wasmtime.js";
import * as lintoko from "./lintoko.js";
import * as wasmOpt from "./wasm-opt.js";
import { FILE_PATH_REGEX } from "../../constants.js";
import * as toolchainUtils from "./toolchain-utils.js";
import { DEFAULT_POCKET_IC_VERSION } from "./pocket-ic-versions.js";
import type { ReleaseInfo } from "./release-tags.js";
import { normalizeBinaryenVersion } from "../../helpers/binaryen-version.js";

function label(text: string): string {
  return chalk.bold(text.padEnd(16));
}

/** Map GitHub tags to the pin format stored in mops.toml (Binaryen: `version_131` → `131`). */
function normalizeReleaseTag(tool: Tool, tag: string): string {
  return tool === "wasm-opt" ? normalizeBinaryenVersion(tag) : tag;
}

export interface ToolchainInfoOptions {
  versions?: boolean;
  all?: boolean;
}

function getToolUtils(tool: Tool) {
  if (tool === "moc") {
    return moc;
  } else if (tool === "pocket-ic") {
    return pocketIc;
  } else if (tool === "wasmtime") {
    return wasmtime;
  } else if (tool === "lintoko") {
    return lintoko;
  } else if (tool === "wasm-opt") {
    return wasmOpt;
  } else {
    console.error(`Unknown tool '${tool}'`);
    process.exit(1);
  }
}

async function download(
  tool: Tool,
  version: string,
  { silent = false, verbose = false } = {},
) {
  if (version.match(FILE_PATH_REGEX)) {
    return;
  }

  let toolUtils = getToolUtils(tool);
  let logUpdate = createLogUpdate(process.stdout, { showCursor: true });

  silent || logUpdate("Installing", tool, version);

  await toolUtils.download(version, { silent, verbose });

  if (verbose) {
    logUpdate.done();
  } else if (!silent) {
    logUpdate.clear();
  }
}

async function installAll({ silent = false, verbose = false } = {}) {
  let config = readConfig();

  if (!config.toolchain) {
    return;
  }

  let logUpdate = createLogUpdate(process.stdout, { showCursor: true });

  let log = (...args: string[]) => {
    if (silent) {
      return;
    }
    if (verbose) {
      console.log(...args);
    } else {
      logUpdate(...args);
    }
  };

  log("Installing toolchain...");

  if (config.toolchain?.moc) {
    await download("moc", config.toolchain.moc, { silent, verbose });
  }
  if (config.toolchain?.wasmtime) {
    await download("wasmtime", config.toolchain.wasmtime, { silent, verbose });
  }
  if (config.toolchain?.["pocket-ic"]) {
    await download("pocket-ic", config.toolchain["pocket-ic"], {
      silent,
      verbose,
    });
  }
  if (config.toolchain?.lintoko) {
    await download("lintoko", config.toolchain.lintoko, { silent, verbose });
  }
  if (config.toolchain?.["wasm-opt"]) {
    await download("wasm-opt", config.toolchain["wasm-opt"], {
      silent,
      verbose,
    });
  }

  if (!silent) {
    logUpdate.clear();
    console.log(chalk.green("Toolchain installed"));
  }
}

async function promptVersion(tool: Tool): Promise<string> {
  let config = readConfig();
  config.toolchain = config.toolchain || {};
  let current = config.toolchain[tool];

  let toolUtils = getToolUtils(tool);
  let releases = await toolUtils.getReleases();
  let versions = releases.map((item: { tag_name: any }) => item.tag_name);
  let currentIndex = versions.indexOf(current);

  let res = await prompts({
    type: "select",
    name: "version",
    message: `Select ${tool} version`,
    choices: releases.map((release: ReleaseInfo, i) => {
      let date = release.published_at
        ? new Date(release.published_at).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : "";
      return {
        title:
          release.tag_name +
          chalk.gray(
            `  ${date}${currentIndex === i ? chalk.italic(" (current)") : ""}`,
          ),
        value: release.tag_name,
      };
    }),
    initial: currentIndex == -1 ? 0 : currentIndex,
  });

  return res.version;
}

// download binary and set version in mops.toml
async function use(tool: Tool, version?: string) {
  if (!version) {
    version = await promptVersion(tool);
  }
  if (!version) {
    return;
  }
  if (version === "latest") {
    version = await getToolUtils(tool).getLatestReleaseTag();
  }

  await download(tool, version);

  let config = readConfig();
  config.toolchain = config.toolchain || {};

  let oldVersion = config.toolchain[tool];

  config.toolchain[tool] = version;
  writeConfig(config);

  await checkRequirements();

  if (oldVersion === version) {
    console.log(`${tool} ${version} is already installed`);
  } else {
    console.log(chalk.green(`Installed ${tool} ${version}`));
  }
}

// download latest binary and set version in mops.toml
async function update(tool?: Tool) {
  let config = readConfig();
  config.toolchain = config.toolchain || {};

  let tools = tool ? [tool] : (Object.keys(config.toolchain) as Tool[]);

  for (let tool of tools) {
    if (!config.toolchain[tool]) {
      console.error(
        `Tool '${tool}' is not defined in [toolchain] section in mops.toml`,
      );
      process.exit(1);
    }

    let toolUtils = getToolUtils(tool);
    let version = await toolUtils.getLatestReleaseTag();

    await download(tool, version);

    let oldVersion = config.toolchain[tool];
    config.toolchain[tool] = version;
    writeConfig(config);

    await checkRequirements();

    if (oldVersion === version) {
      console.log(`Latest ${tool} ${version} is already installed`);
    } else {
      console.log(chalk.green(`Installed ${tool} ${version}`));
    }
  }
}

async function info(tool: Tool, options: ToolchainInfoOptions = {}) {
  let toolUtils = getToolUtils(tool);

  if (options.all && !options.versions) {
    console.error("--all requires --versions");
    process.exit(1);
  }

  if (options.versions) {
    let { tags } = await toolchainUtils.getStableReleaseTags(toolUtils.repo, {
      all: options.all,
    });
    for (let ver of tags) {
      console.log(normalizeReleaseTag(tool, ver));
    }
    return;
  }

  // First page only — enough for latest + a short history preview.
  let {
    tags: rawTags,
    truncated,
    publishedLatest,
  } = await toolchainUtils.getStableReleaseTags(toolUtils.repo);
  let tags = rawTags.map((tag) => normalizeReleaseTag(tool, tag));

  let latest = publishedLatest
    ? normalizeReleaseTag(tool, publishedLatest)
    : await toolUtils.getLatestReleaseTag();

  let configFile = getClosestConfigFile();
  let pinned = configFile
    ? readConfig(configFile).toolchain?.[tool]
    : undefined;

  console.log("");
  console.log(chalk.green.bold(tool));

  if (latest) {
    console.log(chalk.yellow(`latest: ${latest}`));
  }

  if (pinned) {
    console.log(`${label("pinned")}${pinned}`);
  }

  console.log("");
  console.log(
    `${label("repository")}${chalk.cyan(`https://github.com/${toolUtils.repo}`)}`,
  );

  if (tags.length > 0) {
    let shown = tags.slice(0, 10);
    let versionsDisplay = shown.join(", ");
    let remaining = tags.length - shown.length;
    let extra =
      remaining > 0
        ? ` ${chalk.gray(`(+${remaining} more)`)}`
        : truncated
          ? ` ${chalk.gray("(+more)")}`
          : "";
    console.log("");
    console.log(`${label("versions")}${versionsDisplay}${extra}`);
  }

  console.log("");
}

// return current version from mops.toml
async function bin(tool: Tool): Promise<string> {
  let hasConfig = getClosestConfigFile();

  if (!hasConfig) {
    checkConfigFile();
    process.exit(1);
  }

  let config = readConfig();
  let version = config.toolchain?.[tool];

  // `pocket-ic` is the one tool with a mops-controlled default, so replica tests
  // and benchmarks work without a pin. Announced on stderr so command
  // substitution around `mops toolchain bin pocket-ic` stays clean.
  if (!version && tool === "pocket-ic") {
    version = DEFAULT_POCKET_IC_VERSION;
    if (!pocketIc.isCached(version)) {
      process.stderr.write(
        chalk.gray(
          `pocket-ic is not pinned in [toolchain]; downloading the mops default ${version}.\n` +
            `Run \`mops toolchain use pocket-ic ${version}\` to pin it.\n`,
        ),
      );
    }
  }

  if (version) {
    if (version.match(FILE_PATH_REGEX)) {
      return version;
    }

    await download(tool, version, { silent: true });

    if (tool === "moc") {
      return path.join(globalCacheDir, "moc", version, tool);
    } else if (tool === "wasm-opt") {
      return path.join(globalCacheDir, "wasm-opt", version, "bin", "wasm-opt");
    } else {
      return path.join(globalCacheDir, tool, version, tool);
    }
  } else {
    // Both lines go to stderr: stdout is the tool path, and callers command-
    // substitute it. A hint printed there would be read back as the binary.
    console.error(
      `Tool '${tool}' is not defined in [toolchain] section in mops.toml`,
    );
    console.error(
      `Run ${chalk.green(`mops toolchain use ${tool} <version>`)} to install it ` +
        `(${chalk.green(`mops toolchain info ${tool} --versions`)} lists the available versions)`,
    );
    process.exit(1);
  }
}

export let toolchain = {
  use,
  update,
  bin,
  info,
  installAll,
};
