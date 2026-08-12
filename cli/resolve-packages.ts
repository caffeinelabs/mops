import process from "node:process";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import chalk from "chalk";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import {
  checkConfigFile,
  getRootDir,
  parseDepValue,
  parseGithubURL,
  readConfig,
} from "./mops.js";
import { Config, Dependency } from "./types.js";
import { getDepCacheDir, getDepCacheName, isDepCached } from "./cache.js";
import { installMopsDep } from "./commands/install/install-mops-dep.js";
import { getDepName } from "./helpers/get-dep-name.js";
import { getPackageId } from "./helpers/get-package-id.js";
import { normalizeLocalDepPath } from "./helpers/normalize-local-path.js";
import { compareVersions, majorVersion } from "./helpers/compare-versions.js";
import {
  checkLockFileLight,
  readLockFile,
  readLockFileGraph,
} from "./integrity.js";

// A single command resolves several times (local cache sync, lockfile write,
// integrity check), so remember what has been reported to keep one conflict
// from being printed three times.
const reportedConflicts = new Set<string>();

export type ConflictPolicy = "warning" | "error" | "ignore";

let conflictPolicy: ConflictPolicy = "warning";

/**
 * How this command treats cross-major conflicts. It is a property of the
 * invocation, not of one resolve call: a single command resolves 3-5 times, and
 * `mops sources --conflicts ignore` has to silence all of them, not just the
 * last. So the CLI sets the policy up front rather than threading an option
 * down through installAll, the lockfile and the integrity check.
 */
export function setConflictPolicy(policy: ConflictPolicy) {
  conflictPolicy = policy;
}

export async function resolvePackages({ skipLock = false } = {}): Promise<
  Record<string, string>
> {
  return (await resolveDepsAndGraph({ skipLock })).deps;
}

type ResolveResult = {
  deps: Record<string, string>;
  graph: Record<string, Record<string, string>>;
};

// In-process only, never written to disk. A single command resolves 3-5 times
// and rewrites its own inputs while doing so — checkIntegrity writes mops.lock,
// add/remove/update write mops.toml — so the key is the *content* of both, not
// their paths. Local `path` deps are live directories, so their manifests are
// validated too (see `localInputs`).
type ResolveCacheEntry = {
  key: string;
  promise: Promise<ResolveResult>;
  // Local manifests the walk read; unknown until it finishes.
  localInputs: Map<string, string> | null;
};

let resolveCache: ResolveCacheEntry | null = null;

// "" for a file that does not exist, so creating or deleting one invalidates.
function fileHash(file: string): string {
  try {
    return bytesToHex(sha256(readFileSync(file)));
  } catch {
    return "";
  }
}

// `skipLock` is keyed by what it changes, not by its value: it only suppresses
// the lock short-circuit, so with no usable lock the two variants walk the same
// graph. That is what lets a cold install's two resolves (sync, then lock
// regeneration) share one walk.
function resolveCacheKey(rootDir: string, usesLock: boolean): string {
  return [
    rootDir,
    usesLock,
    conflictPolicy,
    process.env.MOPS_ENV || "",
    fileHash(path.join(rootDir, "mops.toml")),
    fileHash(path.join(rootDir, "mops.lock")),
  ].join("|");
}

// Callers iterate and (in the lock's case) embed the result, so hand out a copy
// rather than the memoized object itself.
function copyResult(result: ResolveResult): ResolveResult {
  return { deps: { ...result.deps }, graph: { ...result.graph } };
}

// Resolves winners and collects the declared dependency edges of every
// registry package version visited (losers included), so the lock can be
// regenerated later without those versions on disk.
export async function resolveDepsAndGraph({
  // Bypass a valid lock so lock regeneration re-reads mops.toml (this is how
  // absolute local paths from older CLIs get rewritten root-relative).
  skipLock = false,
} = {}): Promise<ResolveResult> {
  if (!checkConfigFile()) {
    return { deps: {}, graph: {} };
  }

  let rootDir = getRootDir();
  let usesLock = !skipLock && checkLockFileLight();
  let key = resolveCacheKey(rootDir, usesLock);
  let cached = resolveCache;
  if (
    cached &&
    cached.key === key &&
    (cached.localInputs === null ||
      [...cached.localInputs].every(([file, hash]) => fileHash(file) === hash))
  ) {
    return copyResult(await cached.promise);
  }

  let localInputs = new Map<string, string>();
  let entry: ResolveCacheEntry = {
    key,
    localInputs: null,
    promise: resolveDepsAndGraphUncached(usesLock, rootDir, localInputs),
  };
  resolveCache = entry;

  try {
    let result = await entry.promise;
    entry.localInputs = localInputs;
    return copyResult(result);
  } catch (err) {
    if (resolveCache === entry) {
      resolveCache = null;
    }
    throw err;
  }
}

async function resolveDepsAndGraphUncached(
  usesLock: boolean,
  rootDir: string,
  localInputs: Map<string, string>,
): Promise<ResolveResult> {
  if (usesLock) {
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

  let packages: Record<string, Dependency & { isRoot: boolean }> = {};
  let versions: Record<
    string,
    Array<{
      isMopsPackage: boolean;
      version: string;
      dependencyOf: string;
    }>
  > = {};

  const gitVerRegex = /v(\d{1,2}\.\d{1,2}\.\d{1,2})(-.*)?$/;

  // Capture the version instead of slicing off the first character, so a tag
  // like `release-v1.2.0` yields `1.2.0` and not `elease-v1.2.0`.
  const gitRefVersion = (repo: string): string | null => {
    const match = gitVerRegex.exec(parseGithubURL(repo).branch);
    return match ? `${match[1]}${match[2] ?? ""}` : null;
  };

  const compareGitVersions = (repoA: string, repoB: string) => {
    const a = gitRefVersion(repoA);
    const b = gitRefVersion(repoB);

    if (a !== null && b !== null) {
      return compareVersions(a, b);
    }
    // A ref that carries no version (`main`, `moc-0.9.1`) always loses.
    return a === null ? -1 : 1;
  };

  let collectDeps = async (
    config: Config,
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

      // read nested config (github deps have none)
      if (pkgDetails.path) {
        localNestedDir = path
          .resolve(configDir, pkgDetails.path)
          .replaceAll("{MOPS_ENV}", process.env.MOPS_ENV || "local");
        let mopsToml = path.join(localNestedDir, "mops.toml");
        // recorded even when absent: creating one changes the resolution
        localInputs.set(mopsToml, fileHash(mopsToml));
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

  // Cross-major conflicts report by default on every path that resolves, not
  // just where a caller opted in: handing a dependency a different major than
  // it asked for changes the API it compiles against. `ignore` remains a real
  // opt-out, because `mops sources` runs on every build of a project that uses
  // it as a packtool, and one that has knowingly accepted an override needs a
  // way to stop the noise.
  // Same-major skew stays silent.
  let hasConflicts = false;

  if (conflictPolicy !== "ignore") {
    for (let [dep, vers] of Object.entries(versions)) {
      // Only registry deps carry comparable majors; git refs are excluded.
      let mopsVers = [...vers].reverse().filter((x) => x.isMopsPackage);
      let majors = new Set(mopsVers.map((x) => majorVersion(x.version)));

      if (majors.size < 2) {
        continue;
      }

      hasConflicts = true;

      // Keyed on the conflict itself, not just the dependency name, so the 3-5
      // resolution passes in one command collapse to one report while a
      // genuinely different set of dependents still gets through.
      let conflictKey = `${dep}:${mopsVers
        .map((x) => `${x.version}@${x.dependencyOf}`)
        .sort()
        .join(",")}`;
      if (reportedConflicts.has(conflictKey)) {
        continue;
      }
      reportedConflicts.add(conflictKey);

      console.error(
        chalk.reset("") + chalk.redBright("Warning!"),
        `Conflicting major versions of dependency "${dep}"`,
      );

      let seen = new Set<string>();
      for (let { version, dependencyOf } of mopsVers) {
        // Highlight the same major the conflict was detected on, so what is
        // displayed cannot drift from what was compared.
        let rest = version.split(".").slice(1).join(".");
        let dependent = dependencyOf || "<unknown>";
        if (seen.has(`${version} ${dependent}`)) {
          continue;
        }
        seen.add(`${version} ${dependent}`);
        console.error(
          chalk.reset("  ") +
            `${dep} ${chalk.bold.red(majorVersion(version))}${rest ? `.${rest}` : ""} is a dependency of ${chalk.bold(dependent)}`,
        );
      }

      let winner = packages[dep];
      if (winner) {
        // Alias keys like `core@1` are not bare TOML keys.
        let tomlKey = /^[\w-]+$/.test(dep) ? dep : `"${dep}"`;
        // Local and GitHub deps resolve to a path or repo, not a version, so
        // the root can win the conflict without naming a version at all.
        let override = winner.repo || winner.path;
        console.error(
          chalk.reset("  ") +
            (winner.version
              ? `Resolved to ${chalk.bold(`${dep} ${winner.version}`)}`
              : `Resolved to the ${winner.isRoot ? "root " : ""}override ${chalk.bold(`${tomlKey} = "${override}"`)}`) +
            ` — dependents on another major compile against an API they did not ask for.`,
        );
        console.error(
          chalk.reset("  ") +
            `If you want a different version, pin it in your root mops.toml — a root dependency always wins.`,
        );
      }
    }

    // The report above is always a warning, so escalation is a separate line
    // rather than a relabelled duplicate of a report an earlier pass printed.
    if (conflictPolicy === "error" && hasConflicts) {
      console.error(
        chalk.reset("") + chalk.redBright("Error!"),
        "Cross-major dependency conflicts found, failing because --conflicts error was requested",
      );
      process.exit(1);
    }
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
