import process from "node:process";
import path from "node:path";
import fs from "node:fs";

import { globalCacheDir } from "../../mops.js";
import * as toolchainUtils from "./toolchain-utils.js";

let cacheDir = path.join(globalCacheDir, "pocket-ic");

export let repo = "dfinity/pocketic";

export let getLatestReleaseTag = async () => {
  return toolchainUtils.getLatestReleaseTag(repo);
};

export let getReleases = async () => {
  return toolchainUtils.getReleases(repo);
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
    console.error("version is not defined");
    process.exit(1);
  }
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

  await toolchainUtils.downloadAndExtract(
    url,
    path.join(cacheDir, version),
    "pocket-ic",
  );
};
