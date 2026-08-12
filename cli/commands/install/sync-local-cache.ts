import fs from "node:fs";
import path from "node:path";
import {
  copyCache,
  getDepCacheName,
  isDepCached,
  sweepStaleStagingDirs,
} from "../../cache.js";
import { getDependencyType, getRootDir } from "../../mops.js";
import { resolvePackages } from "../../resolve-packages.js";
import { installFromGithub } from "./install-from-github.js";
import { installMopsDep } from "./install-mops-dep.js";

export async function syncLocalCache({ verbose = false } = {}): Promise<
  Record<string, string>
> {
  sweepStaleStagingDirs();

  let resolvedPackages = await resolvePackages();
  let rootDir = getRootDir();

  verbose && console.log("Syncing local cache...");

  let installedDeps: Record<string, string> = {};

  await Promise.all(
    Object.entries(resolvedPackages).map(async ([name, value]) => {
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
    }),
  ).catch((err) => {
    // ncp rejects with an array of errors
    throw Array.isArray(err) ? err[0] : err;
  });

  return installedDeps;
}
