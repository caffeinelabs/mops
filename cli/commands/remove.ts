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
import { checkIntegrity } from "../integrity.js";
import { getDepCacheDir, getDepCacheName } from "../cache.js";
import path from "node:path";
import { syncLocalCache } from "./install/sync-local-cache.js";
import { getPackageId } from "../helpers/get-package-id.js";

type RemoveOptions = {
  verbose?: boolean;
  dev?: boolean;
  dryRun?: boolean;
  lock?: "update" | "ignore";
};

export async function remove(
  name: string,
  { dev = false, verbose = false, dryRun = false, lock }: RemoveOptions = {},
) {
  if (!checkConfigFile()) {
    return;
  }

  function getTransitiveDependencies(config: Config, exceptPkgId: string) {
    let deps = Object.values(config.dependencies || {});
    let devDeps = Object.values(config["dev-dependencies"] || {});
    return [...deps, ...devDeps]
      .filter((dep) => {
        let depId = getPackageId(dep.name, dep.version || "");
        return depId !== exceptPkgId;
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
        return [dep, ...getTransitiveDependenciesOf(dep.name, dep.version)];
      })
      .flat();
    return deps;
  }

  let config = readConfig();
  let deps = dev ? config["dev-dependencies"] : config.dependencies;
  deps = deps || {};
  let pkgDetails = deps[name];

  if (!pkgDetails) {
    return console.log(
      chalk.red("Error: ") +
        `No ${dev ? "dev " : ""}dependency to remove "${name}"`,
    );
  }

  let version = pkgDetails.version;
  let packageId = getPackageId(name, version || "");

  // transitive deps ignoring deps of this package
  let transitiveDeps = getTransitiveDependencies(config, packageId);
  let transitiveDepIds = new Set(
    transitiveDeps.map((dep) => {
      return getPackageId(dep.name, dep.version || "");
    }),
  );

  // transitive deps of this package (including itself)
  let transitiveDepsOfPackage = [
    pkgDetails,
    ...getTransitiveDependenciesOf(name, version),
  ];

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
    let cacheName = getDepCacheName(dep.name, dep.version || dep.repo || "");
    let localCacheDir = path.join(getRootDir(), ".mops", cacheName);
    if (localCacheDir && fs.existsSync(localCacheDir)) {
      dryRun || deleteSync([localCacheDir], { force: true });
      verbose && console.log(`Removed local cache ${localCacheDir}`);
    }
  }

  // remove from config
  if (!dev && config.dependencies) {
    delete config.dependencies[name];
  }
  if (dev && config["dev-dependencies"]) {
    delete config["dev-dependencies"][name];
  }
  dryRun || writeConfig(config);

  await syncLocalCache();
  await checkIntegrity(lock);

  console.log(chalk.green("Package removed ") + `${name} = "${version}"`);
}
