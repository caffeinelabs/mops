import fs from "node:fs";
import { deleteSync } from "del";
import chalk from "chalk";
import {
  checkConfigFile,
  getRootDir,
  readConfig,
  writeConfig,
} from "../mops.js";
import { Config, Dependency } from "../types.js";
import { checkIntegrity, LockPolicy } from "../integrity.js";
import { getDepCacheDir, getDepCacheName } from "../cache.js";
import path from "node:path";
import { syncLocalCache } from "./install/sync-local-cache.js";
import { getPackageId } from "../helpers/get-package-id.js";

type DepsSection = "dependencies" | "dev-dependencies";

type RemoveOptions = {
  verbose?: boolean;
  dev?: boolean;
  dryRun?: boolean;
  // Internal: see `AddOptions.lock`.
  lock?: LockPolicy;
  // Only the interactive `mops remove` searches both sections. `mops sync`
  // removes a dual-declared package with one call per section, so a search
  // across both would clear it on the first call and error on the second.
  anySection?: boolean;
};

export async function remove(
  name: string,
  {
    dev = false,
    verbose = false,
    dryRun = false,
    lock = "maintain",
    anySection = false,
  }: RemoveOptions = {},
) {
  checkConfigFile();

  function getTransitiveDependencies(
    config: Config,
    exceptPkgIds: Set<string>,
  ) {
    let deps = Object.values(config.dependencies || {});
    let devDeps = Object.values(config["dev-dependencies"] || {});
    return [...deps, ...devDeps]
      .filter((dep) => {
        let depId = getPackageId(dep.name, dep.version || "");
        return !exceptPkgIds.has(depId);
      })
      .map((dep) => {
        return [
          dep,
          ...getTransitiveDependenciesOf(dep.name, dep.version, dep.repo),
        ];
      })
      .flat();
  }

  function getTransitiveDependenciesOf(
    name: string,
    version: string | undefined,
    repo?: string,
  ) {
    let value = version || repo;
    if (!value) {
      return [];
    }
    let cacheName = getDepCacheName(name, value);
    let pkgDir = getDepCacheDir(cacheName);
    let configFile = pkgDir + "/mops.toml";
    if (!fs.existsSync(configFile)) {
      verbose && console.log("no config", configFile);
      return [];
    }
    let config = readConfig(configFile);
    let deps: Dependency[] = Object.values(config.dependencies || {})
      .map((dep) => {
        return [
          dep,
          ...getTransitiveDependenciesOf(dep.name, dep.version, dep.repo),
        ];
      })
      .flat();
    return deps;
  }

  let config = readConfig();

  // `npm uninstall` and `cargo remove` drop the dependency wherever it is
  // declared; `--dev` narrows the search to [dev-dependencies].
  let sections: DepsSection[] =
    dev || !anySection
      ? [dev ? "dev-dependencies" : "dependencies"]
      : ["dependencies", "dev-dependencies"];
  let targets = sections
    .map((section) => ({ section, dep: (config[section] || {})[name] }))
    .filter((target): target is { section: DepsSection; dep: Dependency } =>
      Boolean(target.dep),
    );

  if (!targets.length) {
    return console.log(
      chalk.red("Error: ") +
        `No ${dev ? "dev " : ""}dependency to remove "${name}"`,
    );
  }

  let packageIds = new Set(
    targets.map(({ dep }) => getPackageId(name, dep.version || "")),
  );

  // transitive deps ignoring deps of this package
  let transitiveDeps = getTransitiveDependencies(config, packageIds);
  let transitiveDepIds = new Set(
    transitiveDeps.map((dep) => {
      return getPackageId(dep.name, dep.version || "");
    }),
  );

  // transitive deps of this package (including itself)
  let transitiveDepsOfPackage = targets.flatMap(({ dep }) => [
    dep,
    ...getTransitiveDependenciesOf(name, dep.version, dep.repo),
  ]);

  // remove local cache
  for (let dep of transitiveDepsOfPackage) {
    let depId = getPackageId(dep.name, dep.version || "");
    if (transitiveDepIds.has(depId)) {
      verbose &&
        console.log(
          `Ignored transitive dependency ${depId} (other deps depend on it)`,
        );
      continue;
    }
    let depValue = dep.version || dep.repo;
    // local path deps live in the user's tree, not under `.mops`
    if (!depValue) {
      continue;
    }
    let cacheName = getDepCacheName(dep.name, depValue);
    let localCacheDir = path.join(getRootDir(), ".mops", cacheName);
    if (localCacheDir && fs.existsSync(localCacheDir)) {
      if (dryRun) {
        verbose && console.log(`Would remove local cache ${localCacheDir}`);
      } else {
        deleteSync([localCacheDir], { force: true });
        verbose && console.log(`Removed local cache ${localCacheDir}`);
      }
    }
  }

  // remove from config
  for (let { section } of targets) {
    let deps = config[section];
    if (deps) {
      delete deps[name];
    }
  }

  // A dry run must not touch mops.toml, the local cache or mops.lock — the
  // lockfile is rewritten by `checkIntegrity` even when it was only stale.
  if (dryRun) {
    for (let { section, dep } of targets) {
      console.log(
        chalk.yellow("Would remove package ") +
          `${name} = "${dep.repo || dep.path || dep.version}" from [${section}]`,
      );
    }
    return;
  }

  writeConfig(config);

  await syncLocalCache();
  await checkIntegrity(lock);

  for (let { section, dep } of targets) {
    console.log(
      chalk.green("Package removed ") +
        `${name} = "${dep.repo || dep.path || dep.version}" from [${section}]`,
    );
  }
}
