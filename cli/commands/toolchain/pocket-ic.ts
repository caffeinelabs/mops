import process from "node:process";
import path from "node:path";
import fs from "node:fs";

import { globalCacheDir } from "../../mops.js";
import * as toolchainUtils from "./toolchain-utils.js";
import { assertMinimumVersion } from "./pocket-ic-versions.js";
import { cliError } from "../../error.js";

let cacheDir = path.join(globalCacheDir, "pocket-ic");

export let repo = "dfinity/pocketic";

export let getLatestReleaseTag = async ({ prerelease = false } = {}) => {
  return toolchainUtils.getLatestReleaseTag(repo, { prerelease });
};

export let getReleases = async ({ prerelease = false } = {}) => {
  return toolchainUtils.getReleases(repo, { prerelease });
};

export let getReleaseTags = async (
  options: toolchainUtils.ReleaseTagOptions = {},
) => {
  return toolchainUtils.getReleaseTags(repo, options);
};

export let isCached = (version: string) => {
  let dir = path.join(cacheDir, version);
  return fs.existsSync(dir) && fs.existsSync(path.join(dir, "pocket-ic"));
};

export let download = async (
  version: string,
  { silent = false, verbose = false } = {},
) => {
  if (!version) {
    cliError("version is not defined");
  }
  assertMinimumVersion(version);
  if (isCached(version)) {
    if (verbose) {
      console.log(`pocket-ic ${version} is already installed`);
    }
    return;
  }

  let platfrom = process.platform == "darwin" ? "darwin" : "linux";
  let arch = "x86_64";
  let url = `https://github.com/dfinity/pocketic/releases/download/${version}/pocket-ic-${arch}-${platfrom}.gz`;

  if (verbose && !silent) {
    console.log(`Downloading ${url}`);
  }

  await toolchainUtils.installVersion(path.join(cacheDir, version), {
    label: `pocket-ic ${version}`,
    isComplete: () => isCached(version),
    populate: (stagingDir) =>
      toolchainUtils.downloadAndExtract(url, stagingDir, "pocket-ic"),
  });
};
