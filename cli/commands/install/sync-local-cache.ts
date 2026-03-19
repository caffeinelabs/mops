import fs from "node:fs";
import path from "node:path";
import { copyCache, getDepCacheName } from "../../cache.js";
import { getDependencyType, getRootDir } from "../../mops.js";
import { resolvePackages } from "../../resolve-packages.js";

export async function syncLocalCache({ verbose = false } = {}): Promise<
  Record<string, string>
> {
  let resolvedPackages = await resolvePackages();
  let rootDir = getRootDir();

  verbose && console.log("Syncing local cache...");

  let installedDeps: Record<string, string> = {};

  await Promise.all(
    Object.entries(resolvedPackages).map(([name, value]) => {
      let depType = getDependencyType(value);

      if (depType === "mops" || depType === "github") {
        let cacheName = getDepCacheName(name, value);
        let dest = path.join(rootDir, ".mops", cacheName);

        if (!fs.existsSync(dest)) {
          if (depType === "mops") {
            installedDeps[name] = value;
          }
          return copyCache(cacheName, path.join(rootDir, ".mops", cacheName));
        }
      }

      return Promise.resolve();
    }),
  ).catch((errors) => {
    throw errors?.[0];
  });

  return installedDeps;
}
