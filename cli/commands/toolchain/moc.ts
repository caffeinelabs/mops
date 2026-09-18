import process from "node:process";
import path from "node:path";
import fs from "fs-extra";
import { SemVer } from "semver";

import { globalCacheDir } from "../../mops.js";
import * as toolchainUtils from "./toolchain-utils.js";
import { cliError } from "../../error.js";

let cacheDir = path.join(globalCacheDir, "moc");

export let repo = "caffeinelabs/motoko";

export let getLatestReleaseTag = async ({ prerelease = false } = {}) => {
  return toolchainUtils.getLatestReleaseTag(repo, { prerelease });
};

export let getReleases = async ({ prerelease = false } = {}) => {
  return toolchainUtils.getReleases(repo, { prerelease });
};

export let isCached = (version: string, filename: "moc" | "moc.js") => {
  let dir = path.join(cacheDir, version);
  return fs.existsSync(dir) && fs.existsSync(path.join(dir, filename));
};

export let download = async (
  version: string,
  { silent = false, verbose = false } = {},
) => {
  if (process.platform == "win32") {
    cliError("Windows is not supported. Please use WSL");
  }
  if (!version) {
    cliError("version is not defined");
  }

  const destDir = path.join(cacheDir, version);
  const jsUrl = `https://github.com/caffeinelabs/motoko/releases/download/${version}/moc-${version}.js`;

  if (isCached(version, "moc")) {
    if (verbose) {
      console.log(`moc ${version} is already installed`);
    }
  } else {
    let url = archiveUrl(version);
    await toolchainUtils.installVersion(destDir, {
      label: `moc ${version}`,
      isComplete: () => isCached(version, "moc"),
      populate: async (stagingDir) => {
        // moc.js rides along with the binary: one staged install, one rename.
        await downloadMocJs(jsUrl, stagingDir, { silent, verbose });
        if (verbose && !silent) {
          console.log(`Downloading ${url}`);
        }
        await toolchainUtils.downloadAndExtract(url, stagingDir);
      },
    });
  }

  // moc.js is best-effort (older releases ship none), so a complete install
  // can lack it. Keep retrying per run as before.
  if (isCached(version, "moc.js")) {
    if (verbose) {
      console.log(`moc.js ${version} is already downloaded`);
    }
  } else {
    await downloadMocJs(jsUrl, destDir, { silent, verbose });
  }
};

let archiveUrl = (version: string) => {
  if (new SemVer(version).compare(new SemVer("0.14.6")) >= 0) {
    let platfrom = process.platform == "darwin" ? "Darwin" : "Linux";
    let arch = process.arch.startsWith("arm")
      ? process.platform == "darwin"
        ? "arm64"
        : "aarch64"
      : "x86_64";
    return `https://github.com/caffeinelabs/motoko/releases/download/${version}/motoko-${platfrom}-${arch}-${version}.tar.gz`;
  } else if (new SemVer(version).compare(new SemVer("0.9.5")) >= 0) {
    let platfrom = process.platform == "darwin" ? "Darwin" : "Linux";
    let arch = "x86_64";
    return `https://github.com/caffeinelabs/motoko/releases/download/${version}/motoko-${platfrom}-${arch}-${version}.tar.gz`;
  } else {
    let platfrom = process.platform == "darwin" ? "macos" : "linux64";
    return `https://github.com/caffeinelabs/motoko/releases/download/${version}/motoko-${platfrom}-${version}.tar.gz`;
  }
};

// Write-then-rename: a peer exec'ing moc.js from a complete install never
// sees a partial file.
let downloadMocJs = async (
  jsUrl: string,
  dir: string,
  { silent, verbose }: { silent: boolean; verbose: boolean },
) => {
  if (verbose && !silent) {
    console.log(`Downloading ${jsUrl}`);
  }
  const buffer = await toolchainUtils.tryDownloadFile(jsUrl);
  if (!buffer) {
    if (verbose && !silent) {
      console.log(`Warning: Could not download ${jsUrl}`);
    }
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  let partial = path.join(dir, `.moc.js-${process.pid}`);
  fs.writeFileSync(partial, buffer);
  fs.renameSync(partial, path.join(dir, "moc.js"));
};
