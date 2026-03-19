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

export let addCache = (cacheName: string, source: string) => {
  let dest = path.join(getGlobalCacheDir(), "packages", cacheName);
  fs.mkdirSync(dest, { recursive: true });

  return new Promise<void>((resolve, reject) => {
    ncp.ncp(source, dest, { stopOnErr: true }, (err) => {
      if (err) {
        reject(err);
      }
      resolve();
    });
  });
};

export let copyCache = (cacheName: string, dest: string) => {
  let source = path.join(getGlobalCacheDir(), "packages", cacheName);
  fs.mkdirSync(dest, { recursive: true });

  return new Promise<void>((resolve, reject) => {
    ncp.ncp(source, dest, { stopOnErr: true }, (err) => {
      if (err) {
        reject(err);
      }
      resolve();
    });
  });
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
