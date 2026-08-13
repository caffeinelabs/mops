import process from "node:process";
import path from "node:path";
import { existsSync } from "node:fs";
import chalk from "chalk";
import {
  checkConfigFile,
  getRootDir,
  parseDepValue,
  parseGithubURL,
  readConfig,
} from "./mops.js";
import { VesselConfig, installFromGithub, readVesselConfig } from "./vessel.js";
import { Config, Dependency } from "./types.js";
import { getDepCacheDir, getDepCacheName, isDepCached } from "./cache.js";
import { installMopsDep } from "./commands/install/install-mops-dep.js";
import { getDepName } from "./helpers/get-dep-name.js";
import { getPackageId } from "./helpers/get-package-id.js";
import { normalizeLocalDepPath } from "./helpers/normalize-local-path.js";
import {
  checkLockFileLight,
  readLockFile,
  readLockFileGraph,
} from "./integrity.js";

type ResolveOptions = {
  conflicts?: "warning" | "error" | "ignore";
  // Bypass a valid lock so `--lock update` can rewrite absolute local paths.
  skipLock?: boolean;
};

export async function resolvePackages(
  options: ResolveOptions = {},
): Promise<Record<string, string>> {
  return (await resolveDepsAndGraph(options)).deps;
}

// Resolves winners and collects the declared dependency edges of every
// registry package version visited (losers included), so the lock can be
// regenerated later without those versions on disk.
export async function resolveDepsAndGraph({
  conflicts = "ignore",
  skipLock = false,
}: ResolveOptions = {}): Promise<{
  deps: Record<string, string>;
  graph: Record<string, Record<string, string>>;
}> {
  if (!checkConfigFile()) {
    return { deps: {}, graph: {} };
  }

  if (!skipLock && checkLockFileLight()) {
    let lockFileJson = readLockFile();

    if (lockFileJson && lockFileJson.version === 3) {
      return { deps: lockFileJson.deps, graph: lockFileJson.graph ?? {} };
    }
  }

  // edges from the previous lock (even a stale one) substitute for manifests
  // of versions absent from the cache; published versions are immutable,
  // so recorded edges never go stale
  let lockGraph = readLockFileGraph();
  let graph: Record<string, Record<string, string>> = {};

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

  let compareVersions = (a: string = "0.0.0", b: string = "0.0.0") => {
    let ap = a.split(".").map((x: string) => parseInt(x) || 0) as [
      number,
      number,
      number,
    ];
    let bp = b.split(".").map((x: string) => parseInt(x) || 0) as [
      number,
      number,
      number,
    ];
    if (ap[0] - bp[0]) {
      return Math.sign(ap[0] - bp[0]);
    }
    if (ap[0] === bp[0] && ap[1] - bp[1]) {
      return Math.sign(ap[1] - bp[1]);
    }
    if (ap[0] === bp[0] && ap[1] === bp[1] && ap[2] - bp[2]) {
      return Math.sign(ap[2] - bp[2]);
    }
    return 0;
  };

  const gitVerRegex = new RegExp(/v(\d{1,2}\.\d{1,2}\.\d{1,2})(-.*)?$/);

  const compareGitVersions = (repoA: string, repoB: string) => {
    const { branch: a } = parseGithubURL(repoA);
    const { branch: b } = parseGithubURL(repoB);

    if (gitVerRegex.test(a) && gitVerRegex.test(b)) {
      return compareVersions(a.substring(1), b.substring(1));
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
            compareVersions(packages[name]?.version, version) === -1))
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
        if (!isDepCached(cacheDir)) {
          // best effort: an uncached github dep would otherwise silently
          // drop its nested deps from resolution
          await installFromGithub(name, repo, {
            silent: true,
            ignoreTransitive: true,
          });
        }
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
        let pkgId = getPackageId(name, version);
        let lockedEdges = lockGraph[pkgId];
        if (lockedEdges) {
          nestedConfig = {
            package: { name: getDepName(name), version },
            dependencies: Object.fromEntries(
              Object.entries(lockedEdges).map(([depName, depValue]) => [
                depName,
                parseDepValue(depName, depValue),
              ]),
            ),
          };
        } else {
          let cacheDir = getDepCacheName(name, version);
          // a lock-driven install only caches winning versions, so a re-walk
          // with a pre-graph lock can hit versions absent from the cache —
          // fetch them instead of crashing
          if (!isDepCached(cacheDir)) {
            let ok = await installMopsDep(name, version, {
              silent: true,
              ignoreTransitive: true,
            });
            if (!ok) {
              console.error(
                chalk.red("Error: ") +
                  `Package ${name}@${version} is not in the cache and could not be downloaded`,
              );
              process.exit(1);
            }
          }
          nestedConfig = readConfig(
            path.join(getDepCacheDir(cacheDir), "mops.toml"),
          );
        }

        // local path deps are mutable, so a package declaring one is never
        // recorded — its manifest is always read live
        if (!(pkgId in graph)) {
          let nestedDeps = Object.values(nestedConfig.dependencies || {});
          if (nestedDeps.every((dep) => dep.version || dep.repo)) {
            graph[pkgId] = Object.fromEntries(
              nestedDeps.map((dep) => [
                dep.name,
                dep.version || dep.repo || "",
              ]),
            );
          }
        }
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

  if (conflicts !== "ignore") {
    for (let [dep, vers] of Object.entries(versions)) {
      let majors = new Set(
        vers.filter((x) => x.isMopsPackage).map((x) => x.version.split(".")[0]),
      );
      if (majors.size > 1) {
        console.error(
          chalk.reset("") +
            chalk.redBright(conflicts === "error" ? "Error!" : "Warning!"),
          `Conflicting versions of dependency "${dep}"`,
        );

        for (let { version, dependencyOf } of [...vers].reverse()) {
          console.error(
            chalk.reset("  ") +
              `${dep} ${chalk.bold.red(version.split(".")[0])}.${version.split(".").slice(1).join(".")} is dependency of ${chalk.bold(dependencyOf)}`,
          );
        }

        hasConflicts = true;
      }
    }
  }

  if (conflicts === "error" && hasConflicts) {
    process.exit(1);
  }

  let deps = Object.fromEntries(
    Object.entries(packages)
      .map(([name, pkg]) => {
        let version: string;
        if (pkg.path) {
          // Root-relative so mops.lock is portable across machines.
          version = normalizeLocalDepPath(
            rootDir,
            pkg.path.replaceAll("{MOPS_ENV}", process.env.MOPS_ENV || "local"),
          );
        } else if (pkg.repo) {
          version = pkg.repo;
        } else if (pkg.version) {
          version = pkg.version;
        } else {
          return [name, ""];
        }
        return [name, version];
      })
      .filter(([, version]) => version !== ""),
  );

  return { deps, graph };
}
