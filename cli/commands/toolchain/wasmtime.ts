import process from "node:process";
import path from "node:path";
import fs from "fs-extra";

import { globalCacheDir } from "../../mops.js";
import * as toolchainUtils from "./toolchain-utils.js";
import { cliError } from "../../error.js";

let cacheDir = path.join(globalCacheDir, "wasmtime");

export let repo = "bytecodealliance/wasmtime";

export let getLatestReleaseTag = async ({ prerelease = false } = {}) => {
  return toolchainUtils.getLatestReleaseTag(repo, { prerelease });
};

export let getReleases = async ({ prerelease = false } = {}) => {
  return toolchainUtils.getReleases(repo, { prerelease });
};

/**
 * `wasmtime` publishes a floating, non-version tag `dev` that GitHub does not
 * flag as a prerelease. Excluded by name; everything else is a real release.
 */
export let getReleaseTags = async ({
  all = false,
  prerelease = false,
}: toolchainUtils.ReleaseTagOptions = {}): Promise<string[]> => {
  let { tags } = await toolchainUtils.getReleaseTags(repo, {
    all,
    prerelease,
  });
  return tags.filter((tag) => tag !== "dev");
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
