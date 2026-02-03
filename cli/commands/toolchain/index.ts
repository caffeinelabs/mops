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
import { FILE_PATH_REGEX } from "../../constants.js";

function getToolUtils(tool: Tool) {
  if (tool === "moc") {
    return moc;
  } else if (tool === "pocket-ic") {
    return pocketIc;
  } else if (tool === "wasmtime") {
    return wasmtime;
  } else if (tool === "lintoko") {
    return lintoko;
  } else {
    console.error(`Unknown tool '${tool}'`);
    process.exit(1);
  }
}

async function ensureToolchainInited({ strict = true } = {}) {
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
  console.error(
    'Toolchain management is not initialized. Run "mops toolchain init"',
  );
  process.exit(1);
}

// update shell config files to set DFX_MOC_PATH to moc-wrapper
async function init({ reset = false, silent = false } = {}) {
  if (process.platform == "win32") {
    console.error("Windows is not supported. Please use WSL");
    process.exit(1);
  }

  try {
    let res = execSync("which mocv").toString().trim();
    if (res) {
      console.error(
        "Mops is not compatible with mocv. Please uninstall mocv and try again.",
      );
      console.log("Steps to uninstall mocv:");
      console.log('1. Run "mocv reset"');
      console.log('2. Run "npm uninstall -g mocv"');
      console.log(
        'TIP: Alternative to "mocv use <version>" is "mops toolchain use moc <version>" (installs moc only for current project)',
      );
      console.log("TIP: More details at https://docs.mops.one/cli/toolchain");
      if (!process.env.CI || !silent) {
        process.exit(1);
      }
    }
  } catch {}

  let zshrc = path.join(os.homedir(), ".zshrc");
  let bashrc = path.join(os.homedir(), ".bashrc");
  let bashProfile = path.join(os.homedir(), ".bash_profile");
  let zprofile = path.join(os.homedir(), ".zprofile");

  let shellConfigFiles = [
    bashrc,
    zshrc,
    bashProfile,
    zprofile,
    process.env.GITHUB_ENV || "",
  ]
    .map((x) => x)
    .filter((file) => {
      return fs.existsSync(file);
    });

  if (shellConfigFiles.length === 0) {
    console.error(
      "Shell config files not found: .bashrc, .zshrc, .bash_profile, .zprofile",
    );
    console.log(
      'TIP: You can add "export DFX_MOC_PATH=moc-wrapper" to your shell config file manually to initialize Mops toolchain',
    );
    process.exit(1);
  }

  // update all existing shell config files
  for (let shellConfigFile of shellConfigFiles) {
    let text = fs.readFileSync(shellConfigFile).toString();
    let setDfxMocPathLine = "\nexport DFX_MOC_PATH=moc-wrapper";

    let newLines = [setDfxMocPathLine];

    let oldLines = [
      // legacy mocv lines
      `\nexport DFX_MOC_PATH=${path.join(path.join(os.homedir(), ".cache/mocv"), "versions/current")}/moc`,
      '\nexport DFX_MOC_PATH="$HOME/.cache/mocv/versions/current/moc"',
      // new
      setDfxMocPathLine,
    ];

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
    console.log("Restart terminal to apply changes");
  }
}

async function download(
  tool: Tool,
  version: string,
  { silent = false, verbose = false } = {},
) {
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
    choices: releases.map(
      (
        release: { published_at: string | number | Date; tag_name: string },
        i: any,
      ) => {
        let date = new Date(release.published_at).toLocaleDateString(
          undefined,
          { year: "numeric", month: "short", day: "numeric" },
        );
        return {
          title:
            release.tag_name +
            chalk.gray(
              `  ${date}${currentIndex === i ? chalk.italic(" (current)") : ""}`,
            ),
          value: release.tag_name,
        };
      },
    ),
    initial: currentIndex == -1 ? 0 : currentIndex,
  });

  return res.version;
}

// download binary and set version in mops.toml
async function use(tool: Tool, version?: string) {
  if (tool === "moc") {
    await ensureToolchainInited();
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
    await ensureToolchainInited();
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

    if (tool === "moc") {
      await checkRequirements();
    }

    if (oldVersion === version) {
      console.log(`Latest ${tool} ${version} is already installed`);
    } else {
      console.log(chalk.green(`Installed ${tool} ${version}`));
    }
  }
}

// return current version from mops.toml
async function bin(tool: Tool, { fallback = false } = {}): Promise<string> {
  let hasConfig = getClosestConfigFile();

  // fallback to dfx moc
  if (!hasConfig) {
    if (tool === "moc" && fallback) {
      return execSync("dfx cache show").toString().trim() + "/moc";
    }
    checkConfigFile();
    process.exit(1);
  }

  let config = readConfig();
  let version = config.toolchain?.[tool];

  if (version) {
    if (version.match(FILE_PATH_REGEX)) {
      return version;
    }

    if (tool === "moc") {
      await ensureToolchainInited();
    }

    await download(tool, version, { silent: true });

    if (tool === "moc") {
      return path.join(globalCacheDir, "moc", version, tool);
    } else {
      return path.join(globalCacheDir, tool, version, tool);
    }
  } else {
    // fallback to dfx moc
    if (tool === "moc" && fallback) {
      return execSync("dfx cache show").toString().trim() + "/moc";
    }
    console.error(
      `Tool '${tool}' is not defined in [toolchain] section in mops.toml`,
    );
    console.log(
      `Run ${chalk.green(`mops toolchain use ${tool}`)} to install it`,
    );
    process.exit(1);
  }
}

export let toolchain = {
  init,
  use,
  update,
  bin,
  installAll,
  ensureToolchainInited,
};
