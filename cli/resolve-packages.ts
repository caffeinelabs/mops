import process from "node:process";
import path from "node:path";
import { existsSync } from "node:fs";
import chalk from "chalk";
import {
  checkConfigFile,
  getRootDir,
  parseGithubURL,
  readConfig,
} from "./mops.js";
import { VesselConfig, readVesselConfig } from "./vessel.js";
import { Config, Dependency } from "./types.js";
import {
  findCachedVersions,
  getDepCacheDir,
  getDepCacheName,
} from "./cache.js";
import { getPackageId } from "./helpers/get-package-id.js";
import { checkLockFileLight, readLockFile } from "./integrity.js";
import { semver, isRange, stripRangePrefix } from "./semver.js";

type VersionConstraint = {
  isMopsPackage: boolean;
  version: string;
  dependencyOf: string;
};

function resolveRangeFromCache(
  name: string,
  version: string,
  cache: Map<string, string>,
): string {
  let key = `${name}@${version}`;
  let cached = cache.get(key);
  if (cached !== undefined) return cached;

  let bareVersion = stripRangePrefix(version);
  if (!isRange(version)) {
    cache.set(key, bareVersion);
    return bareVersion;
  }

  let installed = findCachedVersions(name);
  let resolved = semver.maxSatisfying(installed, version) || bareVersion;
  cache.set(key, resolved);
  return resolved;
}

export async function resolvePackages({
  conflicts = "ignore" as "warning" | "error" | "ignore",
} = {}): Promise<Record<string, string>> {
  if (!checkConfigFile()) {
    return {};
  }

  if (checkLockFileLight()) {
    let lockFileJson = readLockFile();

    if (lockFileJson && lockFileJson.version === 3) {
      return lockFileJson.deps;
    }
  }

  let rootDir = getRootDir();
  let packages: Record<string, Dependency & { isRoot: boolean }> = {};
  let versions: Record<string, Array<VersionConstraint>> = {};
  let rangeCache = new Map<string, string>();

  const gitVerRegex = new RegExp(/v(\d{1,2}\.\d{1,2}\.\d{1,2})(-.*)?$/);

  const compareGitVersions = (repoA: string, repoB: string) => {
    const { branch: a } = parseGithubURL(repoA);
    const { branch: b } = parseGithubURL(repoB);

    if (gitVerRegex.test(a) && gitVerRegex.test(b)) {
      return semver.compare(a.substring(1), b.substring(1));
    } else if (!gitVerRegex.test(a)) {
      return -1;
    } else {
      return 1;
    }
  };

  let collectDeps = async (
    config: Config | VesselConfig,
    configDir: string,
    isRoot = false,
  ) => {
    let allDeps = [...Object.values(config.dependencies || {})];
    if (isRoot) {
      allDeps = [
        ...allDeps,
        ...Object.values(config["dev-dependencies"] || {}),
      ];
    }
    for (const pkgDetails of allDeps) {
      const { name, repo, version } = pkgDetails;

      // For version comparison, use resolved versions (not range floors)
      let resolvedCurrent = version
        ? resolveRangeFromCache(name, version, rangeCache)
        : "";
      let resolvedExisting = packages[name]?.version
        ? resolveRangeFromCache(name, packages[name]!.version || "", rangeCache)
        : "";

      if (
        isRoot ||
        !packages[name] ||
        (!packages[name]?.isRoot &&
          ((repo &&
            packages[name]?.repo &&
            compareGitVersions(packages[name]?.repo || "", repo) === -1) ||
            semver.compare(
              resolvedExisting || "0.0.0",
              resolvedCurrent || "0.0.0",
            ) === -1))
      ) {
        let temp = {
          ...pkgDetails,
          isRoot,
        };
        packages[name] = temp;

        if (pkgDetails.path) {
          temp.path = path.relative(
            rootDir,
            path.resolve(configDir, pkgDetails.path),
          );
        }
      }

      let nestedConfig;
      let localNestedDir = "";

      if (repo) {
        let cacheDir = getDepCacheName(name, repo);
        nestedConfig =
          (await readVesselConfig(getDepCacheDir(cacheDir), {
            silent: true,
          })) || {};
      } else if (pkgDetails.path) {
        localNestedDir = path
          .resolve(configDir, pkgDetails.path)
          .replaceAll("{MOPS_ENV}", process.env.MOPS_ENV || "local");
        let mopsToml = path.join(localNestedDir, "mops.toml");
        if (existsSync(mopsToml)) {
          nestedConfig = readConfig(mopsToml);
        }
      } else if (version) {
        let resolved = resolveRangeFromCache(name, version, rangeCache);
        let cacheDir = getDepCacheName(name, resolved);
        nestedConfig = readConfig(
          path.join(getDepCacheDir(cacheDir), "mops.toml"),
        );
      }

      if (nestedConfig) {
        await collectDeps(nestedConfig, localNestedDir, false);
      }

      if (!versions[name]) {
        versions[name] = [];
      }

      let parentPkgId = isRoot ? "<root>" : "";
      if ("package" in config) {
        parentPkgId = getPackageId(
          config.package?.name || "",
          config.package?.version || "",
        );
      }

      if (repo) {
        const { branch } = parseGithubURL(repo);
        versions[name]?.push({
          version: branch,
          dependencyOf: parentPkgId,
          isMopsPackage: false,
        });
      } else if (version) {
        versions[name]?.push({
          version: version,
          dependencyOf: parentPkgId,
          isMopsPackage: true,
        });
      }
    }
  };

  let config = readConfig();
  await collectDeps(config, rootDir, true);

  let hasConflicts = false;

  if (conflicts !== "ignore") {
    for (let [dep, vers] of Object.entries(versions)) {
      let mopsVers = vers.filter((x) => x.isMopsPackage);

      let majors = new Set(
        mopsVers.map((x) => stripRangePrefix(x.version).split(".")[0]),
      );
      if (majors.size > 1) {
        console.error(
          chalk.reset("") +
            chalk.redBright(conflicts === "error" ? "Error!" : "Warning!"),
          `Conflicting versions of dependency "${dep}"`,
        );

        for (let { version, dependencyOf } of [...vers].reverse()) {
          let bare = stripRangePrefix(version);
          console.error(
            chalk.reset("  ") +
              `${dep} ${chalk.bold.red(bare.split(".")[0])}.${bare.split(".").slice(1).join(".")} is dependency of ${chalk.bold(dependencyOf)}`,
          );
        }

        hasConflicts = true;
      }

      // Check range constraint satisfaction
      let resolved = packages[dep];
      if (resolved?.version) {
        let resolvedExact = resolveRangeFromCache(
          dep,
          resolved.version,
          rangeCache,
        );
        for (let constraint of mopsVers) {
          if (isRange(constraint.version)) {
            if (!semver.satisfies(resolvedExact, constraint.version)) {
              console.error(
                chalk.reset("") +
                  chalk.redBright(
                    conflicts === "error" ? "Error!" : "Warning!",
                  ),
                `Resolved version ${dep}@${resolvedExact} does not satisfy constraint "${constraint.version}" required by ${chalk.bold(constraint.dependencyOf)}`,
              );
              hasConflicts = true;
            }
          }
        }
      }
    }
  }

  if (conflicts === "error" && hasConflicts) {
    process.exit(1);
  }

  return Object.fromEntries(
    Object.entries(packages)
      .map(([name, pkg]) => {
        let version: string;
        if (pkg.path) {
          version = path
            .resolve(rootDir, pkg.path)
            .replaceAll("{MOPS_ENV}", process.env.MOPS_ENV || "local");
        } else if (pkg.repo) {
          version = pkg.repo;
        } else if (pkg.version) {
          version = resolveRangeFromCache(name, pkg.version, rangeCache);
        } else {
          return [name, ""];
        }
        return [name, version];
      })
      .filter(([, version]) => version !== ""),
  );
}
