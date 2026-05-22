import fs from "node:fs";
import path from "node:path";
import ncp from "ncp";
import getFolderSize from "get-folder-size";

import {
  getDependencyType,
  getNetwork,
  getRootDir,
  globalCacheDir,
  parseGithubURL,
} from "./mops.js";
import { getPackageId } from "./helpers/get-package-id.js";

let getGlobalCacheDir = () => {
  let network = getNetwork();
  return path.join(globalCacheDir, network === "ic" ? "" : network);
};

// Cache writes stage into a sibling `<dest>/../.staging-<rand>` and atomic-
// rename onto `dest` so concurrent processes never observe a partial cache.
const STAGING_PREFIX = ".staging-";

export function createStagingDir(dest: string): string {
  let parent = path.dirname(dest);
  fs.mkdirSync(parent, { recursive: true });
  return fs.mkdtempSync(path.join(parent, STAGING_PREFIX));
}

// Returns false if another process committed first (race lost) — `staging`
// is removed and the existing `dest` is left intact. We only swallow
// `EPERM` (Windows) when `dest` exists; otherwise it's likely AV / open
// handles and bubbles up.
export function commitStagingDir(staging: string, dest: string): boolean {
  try {
    fs.renameSync(staging, dest);
    return true;
  } catch (err: any) {
    let raceLost =
      (err.code === "ENOTEMPTY" ||
        err.code === "EEXIST" ||
        err.code === "EPERM") &&
      fs.existsSync(dest);
    if (raceLost) {
      fs.rmSync(staging, { recursive: true, force: true });
      return false;
    }
    throw err;
  }
}

// Sweep leftover `.staging-*` from interrupted runs. Mtime cutoff avoids
// clobbering siblings that are mid-staging right now. Runs at most once
// per process.
const STAGING_STALE_MS = 60 * 60 * 1000;
let swept = false;
export function sweepStaleStagingDirs() {
  if (swept) {
    return;
  }
  swept = true;
  let cutoff = Date.now() - STAGING_STALE_MS;
  let parents = [
    path.join(getGlobalCacheDir(), "packages"),
    path.join(getGlobalCacheDir(), "packages", "_github"),
    path.join(getRootDir(), ".mops"),
    path.join(getRootDir(), ".mops", "_github"),
  ];
  for (let parent of parents) {
    if (!fs.existsSync(parent)) {
      continue;
    }
    for (let entry of fs.readdirSync(parent)) {
      if (!entry.startsWith(STAGING_PREFIX)) {
        continue;
      }
      let full = path.join(parent, entry);
      try {
        if (fs.statSync(full).mtimeMs < cutoff) {
          fs.rmSync(full, { recursive: true, force: true });
        }
      } catch {
        // raced with another sweeper; ignore
      }
    }
  }
}

export let show = () => {
  return getGlobalCacheDir();
};

export let getDepCacheDir = (cacheName: string) => {
  return path.join(getGlobalCacheDir(), "packages", cacheName);
};

export let isDepCached = (cacheName: string) => {
  let dir = getDepCacheDir(cacheName);
  return fs.existsSync(dir);
};

export function getDepCacheName(name: string, version: string) {
  let depType = getDependencyType(version);
  return depType === "mops"
    ? getMopsDepCacheName(name, version)
    : getGithubDepCacheName(name, version);
}

export function getMopsDepCacheName(name: string, version: string) {
  return getPackageId(name, version);
}

export function getGithubDepCacheName(name: string, repo: string) {
  const { branch, commitHash } = parseGithubURL(repo);
  return (
    `_github/${name}#${branch.replaceAll("/", "___")}` +
    (commitHash ? `@${commitHash}` : "")
  );
}

export let addCache = async (cacheName: string, source: string) => {
  let dest = path.join(getGlobalCacheDir(), "packages", cacheName);
  let staging = createStagingDir(dest);

  try {
    await new Promise<void>((resolve, reject) => {
      ncp.ncp(source, staging, { stopOnErr: true }, (err) => {
        if (err) {
          reject(err);
        }
        resolve();
      });
    });
    commitStagingDir(staging, dest);
  } catch (err) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw err;
  }
};

export let copyCache = async (cacheName: string, dest: string) => {
  let source = path.join(getGlobalCacheDir(), "packages", cacheName);
  let staging = createStagingDir(dest);

  try {
    await new Promise<void>((resolve, reject) => {
      ncp.ncp(source, staging, { stopOnErr: true }, (err) => {
        if (err) {
          reject(err);
        }
        resolve();
      });
    });
    commitStagingDir(staging, dest);
  } catch (err) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw err;
  }
};

export let cacheSize = async () => {
  let dir = path.join(getGlobalCacheDir());
  fs.mkdirSync(dir, { recursive: true });

  let size = await getFolderSize.strict(dir);
  if (size < 1024 * 1024) {
    return (size / 1024).toFixed(2) + " KB";
  }
  return (size / 1024 / 1024).toFixed(2) + " MB";
};

export let cleanCache = async () => {
  if (
    !getGlobalCacheDir().endsWith("mops/cache") &&
    !getGlobalCacheDir().endsWith("/mops") &&
    !getGlobalCacheDir().endsWith("/mops/" + getNetwork())
  ) {
    throw new Error("Invalid cache directory: " + getGlobalCacheDir());
  }

  // local cache
  fs.rmSync(path.join(getRootDir(), ".mops"), { recursive: true, force: true });

  // global cache
  fs.rmSync(getGlobalCacheDir(), { recursive: true, force: true });
};
