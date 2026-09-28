import path from "node:path";
import fs from "node:fs";
import chalk from "chalk";
import semver from "semver";

import { globalCacheDir } from "../../mops.js";
import * as toolchainUtils from "./toolchain-utils.js";
import {
  assertMinimumVersion,
  RECOMMENDED_POCKET_IC_VERSION,
} from "./pocket-ic-versions.js";
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

export let isCached = (version: string, host: toolchainUtils.Host) => {
  let bin = path.join(cacheDir, version, "pocket-ic");
  if (!fs.existsSync(bin)) {
    return false;
  }
  // A build for another CPU is stale: the cache predates native arm64 downloads, or another host wrote it.
  let built = toolchainUtils.executableArch(bin);
  return built === undefined || built === downloadArch(version, host);
};

export let download = async (
  version: string,
  { silent = false, verbose = false } = {},
) => {
  if (!version) {
    cliError("version is not defined");
  }
  assertMinimumVersion(version);
  // Paths never reach here, so anything else that is not a release version is a typo like `latest`.
  if (!semver.valid(version)) {
    cliError(
      `pocket-ic ${JSON.stringify(version)} is not a release version. Run ${chalk.green(`mops toolchain use pocket-ic ${RECOMMENDED_POCKET_IC_VERSION}`)} to pin one.`,
    );
  }
  let host = toolchainUtils.hostTarget("pocket-ic");
  if (isCached(version, host)) {
    if (verbose) {
      console.log(`pocket-ic ${version} is already installed`);
    }
    return;
  }

  let url = assetUrl(version, host);

  if (verbose && !silent) {
    console.log(`Downloading ${url}`);
  }

  await toolchainUtils.installVersion(path.join(cacheDir, version), {
    label: `pocket-ic ${version}`,
    isComplete: () => isCached(version, host),
    populate: (stagingDir) =>
      toolchainUtils.downloadAndExtract(url, stagingDir, "pocket-ic"),
  });
};

// Releases before 9.0.2 ship x86_64 only, which Apple silicon runs under Rosetta.
let downloadArch = (
  version: string,
  host: toolchainUtils.Host,
): toolchainUtils.Host["arch"] =>
  host.arch == "aarch64" && semver.gte(version, "9.0.2") ? "aarch64" : "x86_64";

export let assetUrl = (version: string, host: toolchainUtils.Host) => {
  let arch = downloadArch(version, host) == "aarch64" ? "arm64" : "x86_64";
  return `https://github.com/${repo}/releases/download/${version}/pocket-ic-${arch}-${host.os}.gz`;
};
