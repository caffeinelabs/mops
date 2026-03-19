import process from "node:process";
import path from "node:path";
import fs from "node:fs";

import { globalCacheDir } from "../../mops.js";
import * as toolchainUtils from "./toolchain-utils.js";

let cacheDir = path.join(globalCacheDir, "lintoko");

export let repo = "caffeinelabs/lintoko";

export let getLatestReleaseTag = async () => {
  return toolchainUtils.getLatestReleaseTag(repo);
};

export let getReleases = async () => {
  return toolchainUtils.getReleases(repo);
};

export let isCached = (version: string) => {
  let dir = path.join(cacheDir, version);
  return fs.existsSync(dir) && fs.existsSync(path.join(dir, "lintoko"));
};

export let download = async (
  version: string,
  { silent = false, verbose = false } = {},
) => {
  if (!version) {
    console.error("version is not defined");
    process.exit(1);
  }
  if (isCached(version)) {
    if (verbose) {
      console.log(`lintoko ${version} is already installed`);
    }
    return;
  }

  let platform =
    process.platform == "darwin" ? "apple-darwin" : "unknown-linux-gnu";
  let arch = process.arch.startsWith("arm") ? "aarch64" : "x86_64";
  let url = `https://github.com/caffeinelabs/lintoko/releases/download/v${version}/lintoko-${arch}-${platform}.tar.xz`;

  if (verbose && !silent) {
    console.log(`Downloading ${url}`);
  }

  await toolchainUtils.downloadAndExtract(
    url,
    path.join(cacheDir, version),
    "lintoko",
  );
};
