import process from "node:process";
import path from "node:path";
import fs from "fs-extra";

import { globalCacheDir } from "../../mops.js";
import * as toolchainUtils from "./toolchain-utils.js";
import { cliError } from "../../error.js";

let cacheDir = path.join(globalCacheDir, "wasmtime");

export let repo = "bytecodealliance/wasmtime";

/**
 * `wasmtime` publishes a floating `dev` tag that GitHub does not flag as a
 * prerelease and that is not a version, so it is excluded by name everywhere.
 */
let devTag = ["dev"];

export let getLatestReleaseTag = async ({ prerelease = false } = {}) => {
  return toolchainUtils.getLatestReleaseTag(repo, {
    prerelease,
    exclude: devTag,
  });
};

export let getReleases = async ({ prerelease = false } = {}) => {
  return toolchainUtils.getReleases(repo, { prerelease, exclude: devTag });
};

export let getReleaseTags = async (
  options: toolchainUtils.ReleaseTagOptions = {},
) => {
  return toolchainUtils.getReleaseTags(repo, { ...options, exclude: devTag });
};

export let isCached = (version: string) => {
  let dir = path.join(cacheDir, version);
  return fs.existsSync(dir) && fs.existsSync(path.join(dir, "wasmtime"));
};
export let download = async (
  version: string,
  { silent = false, verbose = false } = {},
) => {
  if (!version) {
    cliError("version is not defined");
  }
  if (isCached(version)) {
    if (verbose) {
      console.log(`wasmtime ${version} is already installed`);
    }
    return;
  }

  let platfrom = process.platform == "darwin" ? "macos" : "linux";
  let arch = process.arch.startsWith("arm") ? "aarch64" : "x86_64";
  let url = `https://github.com/bytecodealliance/wasmtime/releases/download/v${version}/wasmtime-v${version}-${arch}-${platfrom}.tar.xz`;

  if (verbose && !silent) {
    console.log(`Downloading ${url}`);
  }

  await toolchainUtils.installVersion(path.join(cacheDir, version), {
    label: `wasmtime ${version}`,
    isComplete: () => isCached(version),
    populate: (stagingDir) =>
      toolchainUtils.downloadAndExtract(url, stagingDir),
  });
};
