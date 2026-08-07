import process from "node:process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execSync } from "node:child_process";
import chalk from "chalk";
import prompts from "prompts";
import { createLogUpdate } from "log-update";
import {
  checkConfigFile,
  getClosestConfigFile,
  getRootDir,
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

async function checkToolchainInited({ strict = false } = {}): Promise<boolean> {
  // auto init in CI
  if (process.env.CI) {
    await init({ silent: true });
    return true;
  }

  // for non-stict perform check only if dfx.json exists and moc is listed in [toolchain] section
  let rootDir = getRootDir();
  let config = readConfig();
  if (
    !strict &&
    (!config.toolchain?.moc ||
      (rootDir && !fs.existsSync(path.join(rootDir, "dfx.json"))))
  ) {
    return true;
  }

  try {
    let res = execSync("which moc-wrapper").toString().trim();
    if (res && process.env.DFX_MOC_PATH === "moc-wrapper") {
      return true;
    }
  } catch {}
  process.stderr.write(
    `${chalk.yellow(
      'Toolchain management is not initialized. Run "mops toolchain init" to use with dfx.',
    )}\n`,
  );
  return false;
}

export const SHELLS = ["bash", "zsh"] as const;
export type Shell = (typeof SHELLS)[number];

function shellConfigFile(shell: Shell): string {
  if (shell === "zsh") {
    return path.join(os.homedir(), ".zshrc");
  }
  // bash: prefer ~/.bashrc; fall back to ~/.bash_profile when only it exists
  // (macOS login shells)
  let bashrc = path.join(os.homedir(), ".bashrc");
  let bashProfile = path.join(os.homedir(), ".bash_profile");
  if (!fs.existsSync(bashrc) && fs.existsSync(bashProfile)) {
    return bashProfile;
  }
  return bashrc;
}

function detectShellConfigFile(): string {
  let shell = path.basename(process.env.SHELL || "");
  if ((SHELLS as readonly string[]).includes(shell)) {
    return shellConfigFile(shell as Shell);
  }
  // $SHELL unset or unsupported — fall back to the first existing known config file
  for (let name of [".bashrc", ".zshrc", ".bash_profile", ".zprofile"]) {
    let file = path.join(os.homedir(), name);
    if (fs.existsSync(file)) {
      return file;
    }
  }
  return "";
}

// update shell config file to set DFX_MOC_PATH to moc-wrapper
async function init({
  reset = false,
  silent = false,
  shell,
}: { reset?: boolean; silent?: boolean; shell?: Shell } = {}) {
  if (process.platform == "win32") {
    console.error("Windows is not supported. Please use WSL");
    process.exit(1);
  }

  let shellConfigFiles: string[] = [];

  if (reset) {
    // old versions wrote every detected shell config file — clean them all
    shellConfigFiles = [".bashrc", ".zshrc", ".bash_profile", ".zprofile"]
      .map((name) => path.join(os.homedir(), name))
      .filter((file) => fs.existsSync(file));
  } else {
    let configFile = shell ? shellConfigFile(shell) : detectShellConfigFile();
    if (configFile) {
      shellConfigFiles = [configFile];
    }
  }

  // in GitHub Actions, env vars propagate to next steps via $GITHUB_ENV
  if (process.env.GITHUB_ENV && fs.existsSync(process.env.GITHUB_ENV)) {
    shellConfigFiles.push(process.env.GITHUB_ENV);
  }

  if (shellConfigFiles.length === 0) {
    console.error(
      "Could not detect your shell. Supported shells: " + SHELLS.join(", "),
    );
    console.log(
      `TIP: Run ${chalk.green("mops toolchain init --shell <bash|zsh>")} to choose the shell config file to update`,
    );
    console.log(
      'TIP: You can add "export DFX_MOC_PATH=moc-wrapper" to your shell config file manually to initialize Mops toolchain',
    );
    process.exit(1);
  }

  for (let shellConfigFile of shellConfigFiles) {
    let text = fs.existsSync(shellConfigFile)
      ? fs.readFileSync(shellConfigFile).toString()
      : "";
    let setDfxMocPathLine = "\nexport DFX_MOC_PATH=moc-wrapper";

    let newLines = [setDfxMocPathLine];

    let oldLines = [setDfxMocPathLine];

    // remove old lines
    for (let oldLine of oldLines) {
      text = text.replace(oldLine, "");
    }

    if (text.endsWith("\n\n")) {
      text = text.trimEnd() + "\n";
    }

    // insert new lines
    if (!reset) {
      if (!text.endsWith("\n")) {
        text += "\n";
      }
      for (let newLine of newLines) {
        if (shellConfigFile === process.env.GITHUB_ENV) {
          newLine = newLine.replace("export ", "");
        }
        text += newLine;
      }
      text += "\n";
    }

    fs.writeFileSync(shellConfigFile, text);
  }

  if (!silent) {
    console.log(chalk.green("Success!"));
    console.log(
      `${reset ? "Cleaned" : "Updated"} ${shellConfigFiles.join(", ")}`,
    );
    console.log("Restart terminal to apply changes");
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
  if (tool === "moc") {
    await checkToolchainInited();
  }
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
  if (tool === "moc") {
    await checkToolchainInited();
  }

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

    if (tool === "moc") {
      await checkToolchainInited();
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
    // Both lines go to stderr: stdout is the tool path, and `moc-wrapper`
    // command-substitutes it. A hint printed there is read back as the compiler.
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
  init,
  use,
  update,
  bin,
  info,
  installAll,
  checkToolchainInited,
};
