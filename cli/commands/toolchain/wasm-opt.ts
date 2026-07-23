import process from "node:process";
import path from "node:path";
import fs from "fs-extra";
import { chmodSync } from "node:fs";
import { Octokit } from "octokit";

import { globalCacheDir } from "../../mops.js";
import * as toolchainUtils from "./toolchain-utils.js";
import type { ReleaseInfo } from "./release-tags.js";
import { normalizeBinaryenVersion } from "../../helpers/binaryen-version.js";

export { normalizeBinaryenVersion } from "../../helpers/binaryen-version.js";

let cacheDir = path.join(globalCacheDir, "wasm-opt");

export let repo = "WebAssembly/binaryen";

export let getLatestReleaseTag = async () => {
  let octokit = new Octokit();
  for (let page = 1; ; page++) {
    let res = await octokit.request(`GET /repos/${repo}/releases`, {
      per_page: 100,
      page,
      headers: { "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (res.status !== 200) {
      console.error("Releases fetch error");
      process.exit(1);
    }
    if (res.data.length === 0) {
      break;
    }
    for (let release of res.data) {
      if (!release.draft && !release.prerelease) {
        return normalizeBinaryenVersion(release.tag_name);
      }
    }
    if (res.data.length < 100) {
      break;
    }
  }
  console.error(`Failed to fetch latest release tag for ${repo}`);
  process.exit(1);
};

export let getReleases = async (): Promise<ReleaseInfo[]> => {
  let releases = await toolchainUtils.getReleases(repo);
  return releases.map((r) => ({
    ...r,
    tag_name: normalizeBinaryenVersion(r.tag_name),
  }));
};

export let isCached = (version: string) => {
  let dir = path.join(cacheDir, version);
  return fs.existsSync(dir) && fs.existsSync(path.join(dir, "wasm-opt"));
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
      console.log(`wasm-opt ${version} is already installed`);
    }
    return;
  }

  // GitHub assets: x86_64-linux, aarch64-linux, x86_64-macos, arm64-macos
  let platform = process.platform == "darwin" ? "macos" : "linux";
  let arch =
    process.platform == "darwin"
      ? process.arch.startsWith("arm")
        ? "arm64"
        : "x86_64"
      : process.arch.startsWith("arm")
        ? "aarch64"
        : "x86_64";
  let tag = `version_${version}`;
  let url = `https://github.com/WebAssembly/binaryen/releases/download/${tag}/binaryen-${tag}-${arch}-${platform}.tar.gz`;

  if (verbose && !silent) {
    console.log(`Downloading ${url}`);
  }

  let destDir = path.join(cacheDir, version);
  await toolchainUtils.downloadAndExtract(url, destDir);

  // Tarball nests bin/ under binaryen-version_N/; flatten to match other tools.
  let nestedBin = path.join(destDir, `binaryen-${tag}`, "bin", "wasm-opt");
  let flatBin = path.join(destDir, "wasm-opt");
  if (!fs.existsSync(nestedBin)) {
    console.error(
      `wasm-opt binary not found in Binaryen archive: ${nestedBin}`,
    );
    process.exit(1);
  }
  fs.moveSync(nestedBin, flatBin);
  chmodSync(flatBin, 0o700);
  fs.removeSync(path.join(destDir, `binaryen-${tag}`));
};
