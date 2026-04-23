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
  getDepCacheDir,
  getDepCacheName,
  listCachedPackages,
} from "./cache.js";
import { getPackageId } from "./helpers/get-package-id.js";
import { checkLockFileLight, readLockFile } from "./integrity.js";
import { semver, isRange, stripRangePrefix } from "./semver.js";

export async function resolvePackages({
  conflicts = "ignore" as "warning" | "error" | "ignore",
} = {}): Promise<Record<string, string>> {
  if (!checkConfigFile()) {
    return {};
  }

  // skip the lock-file shortcut when the caller wants conflict detection;
  // conflicts are only computed during the full graph walk below.
  if (conflicts === "ignore" && checkLockFileLight()) {
    let lockFileJson = readLockFile();

    if (lockFileJson && lockFileJson.version === 3) {
      return lockFileJson.deps;
    }
  }

  let rootDir = getRootDir();
  let packages: Record<string, Dependency & { isRoot: boolean }> = {};
  let versions: Record<
    string,
    Array<{
      isMopsPackage: boolean;
      version: string;
      dependencyOf: string;
    }>
  > = {};

  // Resolve a range like "^1.2.3" by picking the highest cached version that
  // satisfies it. Falls back to the floor when nothing is installed (e.g. when
  // the resolver is invoked before a successful install).
  let cachedEntries = listCachedPackages();
  let resolveRange = (name: string, version: string): string => {
    if (!isRange(version)) {
      return version;
    }
    let prefix = `${name}@`;
    let installed = cachedEntries
      .filter((e) => e.startsWith(prefix))
      .map((e) => e.slice(prefix.length));
    return (
      semver.maxSatisfying(installed, version) || stripRangePrefix(version)
    );
  };

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

      // take root dep version or bigger one
      if (
        isRoot ||
        !packages[name] ||
        (!packages[name]?.isRoot &&
          ((repo &&
            packages[name]?.repo &&
            compareGitVersions(packages[name]?.repo || "", repo) === -1) ||
            semver.compare(
              stripRangePrefix(packages[name]?.version || "0.0.0"),
              stripRangePrefix(version || "0.0.0"),
            ) === -1))
      ) {
        let temp = {
          ...pkgDetails,
          isRoot,
        };
        packages[name] = temp;

        // normalize path relative to the root config dir
        if (pkgDetails.path) {
          temp.path = path.relative(
            rootDir,
            path.resolve(configDir, pkgDetails.path),
          );
        }
      }

      let nestedConfig;
      let localNestedDir = "";

      // read nested config
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
        let cacheDir = getDepCacheName(name, resolveRange(name, version));
        nestedConfig = readConfig(
          path.join(getDepCacheDir(cacheDir), "mops.toml"),
        );
      }

      // collect nested deps
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

  // show conflicts
  let hasConflicts = false;
  let warn = chalk.redBright(conflicts === "error" ? "Error!" : "Warning!");

  if (conflicts !== "ignore") {
    for (let [dep, vers] of Object.entries(versions)) {
      let mopsVers = vers.filter((x) => x.isMopsPackage);

      let majors = new Set(
        mopsVers.map((x) => stripRangePrefix(x.version).split(".")[0]),
      );
      if (majors.size > 1) {
        console.error(
          chalk.reset("") + warn,
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
        continue;
      }

      // verify resolved version satisfies all transitive range constraints
      let resolved = packages[dep]?.version;
      if (!resolved) {
        continue;
      }
      let resolvedExact = resolveRange(dep, resolved);
      for (let { version, dependencyOf } of mopsVers) {
        if (isRange(version) && !semver.satisfies(resolvedExact, version)) {
          console.error(
            chalk.reset("") + warn,
            `Resolved version ${dep}@${resolvedExact} does not satisfy constraint "${version}" required by ${chalk.bold(dependencyOf)}`,
          );
          hasConflicts = true;
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
          version = resolveRange(name, pkg.version);
        } else {
          return [name, ""];
        }
        return [name, version];
      })
      .filter(([, version]) => version !== ""),
  );
}
