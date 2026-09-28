import process from "node:process";
import path from "node:path";
import fs from "node:fs";

import { globalCacheDir } from "../../mops.js";
import * as toolchainUtils from "./toolchain-utils.js";
import { cliError } from "../../error.js";

let cacheDir = path.join(globalCacheDir, "mo-fmt");

export let repo = "caffeinelabs/tree-sitter-motoko";

// The repo also releases the grammar under `v*` tags, and GitHub marks the
// grammar's release "Latest", so every lookup lists releases by this prefix.
let tagPrefix = "mo-fmt-v";

export let getLatestReleaseTag = async ({ prerelease = false } = {}) => {
  return toolchainUtils.getLatestReleaseTag(repo, { prerelease, tagPrefix });
};

export let getReleases = async ({ prerelease = false } = {}) => {
  return toolchainUtils.getReleases(repo, { prerelease, tagPrefix });
};

export let getReleaseTags = async (
  options: toolchainUtils.ReleaseTagOptions = {},
) => {
  return toolchainUtils.getReleaseTags(repo, { ...options, tagPrefix });
};

export let isCached = (version: string) => {
  let dir = path.join(cacheDir, version);
  return fs.existsSync(dir) && fs.existsSync(path.join(dir, "mo-fmt"));
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
      console.log(`mo-fmt ${version} is already installed`);
    }
    return;
  }

  if (process.platform === "win32") {
    cliError(
      "mo-fmt has no Windows build. Remove `mo-fmt` from [toolchain] in mops.toml to format with the bundled formatter.",
    );
  }

  // musl builds are static, so one Linux asset runs on any glibc.
  let platform =
    process.platform == "darwin" ? "apple-darwin" : "unknown-linux-musl";
  let arch = process.arch.startsWith("arm") ? "aarch64" : "x86_64";
  let url = `https://github.com/${repo}/releases/download/${tagPrefix}${version}/mo-fmt-${arch}-${platform}.tar.xz`;

  if (verbose && !silent) {
    console.log(`Downloading ${url}`);
  }

  await toolchainUtils.installVersion(path.join(cacheDir, version), {
    label: `mo-fmt ${version}`,
    isComplete: () => isCached(version),
    populate: (stagingDir) =>
      toolchainUtils.downloadAndExtract(url, stagingDir, "mo-fmt"),
  });
};
