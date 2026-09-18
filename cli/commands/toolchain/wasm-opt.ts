import process from "node:process";
import path from "node:path";
import fs from "fs-extra";
import { chmodSync } from "node:fs";
import { execa } from "execa";

import { globalCacheDir } from "../../mops.js";
import * as toolchainUtils from "./toolchain-utils.js";
import type { ReleaseInfo } from "./release-tags.js";
import { normalizeBinaryenVersion } from "../../helpers/binaryen-version.js";
import { cliError } from "../../error.js";

export { normalizeBinaryenVersion } from "../../helpers/binaryen-version.js";

let cacheDir = path.join(globalCacheDir, "wasm-opt");

export let repo = "WebAssembly/binaryen";

/** Resolved wasm-opt path inside a versioned cache dir (keeps sibling `lib/` for rpath). */
export let binaryPath = (version: string) =>
  path.join(cacheDir, version, "bin", "wasm-opt");

export let getLatestReleaseTag = async ({ prerelease = false } = {}) => {
  let tag = await toolchainUtils.getLatestReleaseTag(repo, { prerelease });
  return normalizeBinaryenVersion(tag);
};

export let getReleases = async ({ prerelease = false } = {}): Promise<
  ReleaseInfo[]
> => {
  let releases = await toolchainUtils.getReleases(repo, { prerelease });
  return releases.map((r) => ({
    ...r,
    tag_name: normalizeBinaryenVersion(r.tag_name),
  }));
};

/** Tags normalized into the `131` form mops pins, for pickers and `--versions`. */
export let getReleaseTags = async ({
  all = false,
  prerelease = false,
}: toolchainUtils.ReleaseTagOptions = {}) => {
  let res = await toolchainUtils.getReleaseTags(repo, { all, prerelease });
  return {
    ...res,
    tags: res.tags.map(normalizeBinaryenVersion),
  };
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
    cliError("version is not defined");
  }
  if (process.platform === "win32") {
    cliError("wasm-opt toolchain is not supported on Windows");
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

  await toolchainUtils.installVersion(path.join(cacheDir, version), {
    label: `wasm-opt ${version}`,
    isComplete: () => isCached(version),
    populate: async (stagingDir) => {
      let extractDir = path.join(stagingDir, ".archive");
      await toolchainUtils.downloadAndExtract(url, extractDir);

      // Keep bin/ + lib/ (wasm-opt is linked with @rpath → ../lib/libbinaryen).
      let nestedRoot = path.join(extractDir, `binaryen-${tag}`);
      let nestedBin = path.join(nestedRoot, "bin", "wasm-opt");
      if (!fs.existsSync(nestedBin)) {
        cliError(`wasm-opt binary not found in Binaryen archive: ${nestedBin}`);
      }
      try {
        await fs.move(
          path.join(nestedRoot, "bin"),
          path.join(stagingDir, "bin"),
        );
        await fs.move(
          path.join(nestedRoot, "lib"),
          path.join(stagingDir, "lib"),
        );
        await fs.remove(extractDir);

        let stagedBin = path.join(stagingDir, "bin", "wasm-opt");
        chmodSync(stagedBin, 0o700);
        let smoke = await execa(stagedBin, ["--version"], { reject: false });
        if (smoke.exitCode !== 0) {
          throw new Error(
            smoke.stderr?.trim() || `exit code ${smoke.exitCode}`,
          );
        }
      } catch (err: any) {
        cliError(
          `wasm-opt ${version} failed to install${err?.message ? `: ${err.message}` : ""}`,
        );
      }
    },
  });
};
