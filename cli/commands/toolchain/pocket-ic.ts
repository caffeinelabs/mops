import process from "node:process";
import path from "node:path";
import fs from "node:fs";
import semver from "semver";

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
  let bin = path.join(cacheDir, version, "pocket-ic");
  if (!fs.existsSync(bin)) {
    return false;
  }
  // An x86_64 build cached on an arm64 host is stale: it needs Rosetta, and the release has a native one.
  let stale =
    process.arch === "arm64" &&
    hasArm64Build(version) &&
    toolchainUtils.executableArch(bin) === "x86_64";
  return !stale;
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

  let url = assetUrl(version, toolchainUtils.hostTarget("pocket-ic"));

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

// Releases before 9.0.2 ship x86_64 only, which Apple silicon runs under Rosetta.
let hasArm64Build = (version: string) => semver.gte(version, "9.0.2");

export let assetUrl = (version: string, host: toolchainUtils.Host) => {
  let arch =
    host.arch == "aarch64" && hasArm64Build(version) ? "arm64" : "x86_64";
  return `https://github.com/${repo}/releases/download/${version}/pocket-ic-${arch}-${host.os}.gz`;
};
