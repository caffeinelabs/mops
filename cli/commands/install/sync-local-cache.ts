import fs from "node:fs";
import path from "node:path";
import {
  copyCache,
  getDepCacheName,
  isDepCached,
  sweepStaleStagingDirs,
} from "../../cache.js";
import { getDependencyType, getRootDir } from "../../mops.js";
import { parallel } from "../../parallel.js";
import { resolvePackages } from "../../resolve-packages.js";
import { installFromGithub } from "./install-from-github.js";
import { installMopsDep } from "./install-mops-dep.js";
import { fileThreadsPerPackage } from "./install-concurrency.js";

// Each task is a recursive directory copy, so a graph-wide fan-out runs out
// of file descriptors. On the repair path below a task also downloads, hence
// the matching share of the request budget.
const COPY_CONCURRENCY = 8;

export async function syncLocalCache({ verbose = false } = {}): Promise<
  Record<string, string>
> {
  sweepStaleStagingDirs();

  let resolvedPackages = await resolvePackages();
  let rootDir = getRootDir();
  let repairThreads = fileThreadsPerPackage(COPY_CONCURRENCY);

  verbose && console.log("Syncing local cache...");

  let installedDeps: Record<string, string> = {};

  await parallel(
    COPY_CONCURRENCY,
    Object.entries(resolvedPackages),
    async ([name, value]) => {
      let depType = getDependencyType(value);

      if (depType === "mops" || depType === "github") {
        let cacheName = getDepCacheName(name, value);
        let dest = path.join(rootDir, ".mops", cacheName);

        if (!fs.existsSync(dest)) {
          if (depType === "mops") {
            installedDeps[name] = value;
          }
          // a resolved package can be missing from the global cache
          // (pruned cache, interrupted install) — restore it before copying
          if (!isDepCached(cacheName)) {
            let ok =
              depType === "mops"
                ? await installMopsDep(name, value, {
                    silent: true,
                    ignoreTransitive: true,
                    threads: repairThreads,
                  })
                : await installFromGithub(name, value, { silent: true });
            if (!ok) {
              throw Error(
                `Package ${name} = "${value}" is not in the cache and could not be downloaded`,
              );
            }
          }
          await copyCache(cacheName, dest);
        }
      }
    },
  ).catch((err) => {
    // ncp rejects with an array of errors
    throw Array.isArray(err) ? err[0] : err;
  });

  return installedDeps;
}
