import process from "node:process";
import path from "node:path";
import fs from "fs-extra";
import { chmodSync } from "node:fs";
import { Octokit } from "octokit";
import { execa } from "execa";

import { globalCacheDir } from "../../mops.js";
import * as toolchainUtils from "./toolchain-utils.js";
import type { ReleaseInfo } from "./release-tags.js";
import { normalizeBinaryenVersion } from "../../helpers/binaryen-version.js";

export { normalizeBinaryenVersion } from "../../helpers/binaryen-version.js";

let cacheDir = path.join(globalCacheDir, "wasm-opt");

export let repo = "WebAssembly/binaryen";

/** Resolved wasm-opt path inside a versioned cache dir (keeps sibling `lib/` for rpath). */
export let binaryPath = (version: string) =>
  path.join(cacheDir, version, "bin", "wasm-opt");

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
  return (
    fs.existsSync(binaryPath(version)) && fs.existsSync(path.join(dir, "lib"))
  );
};

export let download = async (
  version: string,
  { silent = false, verbose = false } = {},
) => {
  if (!version) {
    console.error("version is not defined");
    process.exit(1);
  }
  if (process.platform === "win32") {
    console.error("wasm-opt toolchain is not supported on Windows");
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
  // Fresh extract into a temp sibling, then replace — avoids a half-cached broken install.
  let stagingDir = path.join(cacheDir, `.${version}.staging`);
  await fs.remove(stagingDir);
  await fs.remove(destDir);
  await toolchainUtils.downloadAndExtract(url, stagingDir);

  // Keep bin/ + lib/ (wasm-opt is linked with @rpath → ../lib/libbinaryen).
  let nestedRoot = path.join(stagingDir, `binaryen-${tag}`);
  let nestedBin = path.join(nestedRoot, "bin", "wasm-opt");
  if (!fs.existsSync(nestedBin)) {
    await fs.remove(stagingDir);
    console.error(
      `wasm-opt binary not found in Binaryen archive: ${nestedBin}`,
    );
    process.exit(1);
  }
  try {
    await fs.move(path.join(nestedRoot, "bin"), path.join(destDir, "bin"));
    await fs.move(path.join(nestedRoot, "lib"), path.join(destDir, "lib"));
    chmodSync(path.join(destDir, "bin", "wasm-opt"), 0o700);
    await fs.remove(stagingDir);

    let smoke = await execa(binaryPath(version), ["--version"], {
      reject: false,
    });
    if (smoke.exitCode !== 0) {
      throw new Error(smoke.stderr?.trim() || `exit code ${smoke.exitCode}`);
    }
  } catch (err: any) {
    await fs.remove(destDir);
    await fs.remove(stagingDir);
    console.error(
      `wasm-opt ${version} failed to install${err?.message ? `: ${err.message}` : ""}`,
    );
    process.exit(1);
  }
};
