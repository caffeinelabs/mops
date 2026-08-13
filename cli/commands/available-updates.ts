import semver from "semver";
import { mainActor } from "../api/actors.js";
import { getGithubCommit, parseGithubURL } from "../mops.js";
import { Config } from "../types.js";
import { getDepName, getDepPinnedVersion } from "../helpers/get-dep-name.js";
import { SemverPart } from "../declarations/main/main.did.js";
import { cliError } from "../error.js";

export type UpdateBound = "patch" | "caret" | "major";

export type AvailableUpdatesOptions = {
  // `mops outdated` reports registry failures itself, so it can exit with its own
  // "lookup failed" code instead of the shared exit(1).
  throwOnError?: boolean;
};

// [pkg, oldVersion, newVersion]
export async function getAvailableUpdates(
  config: Config,
  pkg?: string,
  bound: UpdateBound = "caret",
  { throwOnError }: AvailableUpdatesOptions = {},
): Promise<Array<[string, string, string]>> {
  let deps = Object.values(config.dependencies || {});
  let devDeps = Object.values(config["dev-dependencies"] || {});
  let allDeps = [...deps, ...devDeps].filter((dep) => dep.version);
  let depsToUpdate = pkg ? allDeps.filter((dep) => dep.name === pkg) : allDeps;

  // skip hard pinned dependencies (e.g. "base@X.Y.Z")
  depsToUpdate = depsToUpdate.filter(
    (dep) =>
      getDepName(dep.name) === dep.name ||
      getDepPinnedVersion(dep.name).split(".").length !== 3,
  );

  // Nothing to resolve: skip the registry round-trip entirely.
  if (depsToUpdate.length === 0) {
    return [];
  }

  let getCurrentVersion = (pkg: string, updateVersion: string) => {
    for (let dep of allDeps) {
      if (getDepName(dep.name) === pkg && dep.version) {
        let pinnedVersion = getDepPinnedVersion(dep.name);
        if (pinnedVersion && !updateVersion.startsWith(pinnedVersion)) {
          continue;
        }
        return dep.version;
      }
    }
    return "";
  };

  let actor = await mainActor();
  let res = await actor.getHighestSemverBatch(
    depsToUpdate.map((dep) => {
      let semverPart: SemverPart = { major: null };
      let name = getDepName(dep.name);
      let pinnedVersion = getDepPinnedVersion(dep.name);
      if (bound === "patch") {
        semverPart = { patch: null };
      } else if (pinnedVersion) {
        semverPart =
          pinnedVersion.split(".").length === 1
            ? { minor: null }
            : { patch: null };
      } else if (bound === "caret") {
        // Caret (cargo-style): ^0.x.y -> 0.x.* (patch only); ^1+ -> same major (minor+patch)
        let major = semver.major(dep.version!);
        semverPart = major === 0 ? { patch: null } : { minor: null };
      }
      return [name, dep.version!, semverPart];
    }),
  );

  if ("err" in res) {
    if (throwOnError) {
      throw new Error(res.err);
    }
    cliError("Error: " + res.err);
  }

  return res.ok
    .filter((dep) => dep[1] !== getCurrentVersion(dep[0], dep[1]))
    .map((dep) => [dep[0], getCurrentVersion(dep[0], dep[1]), dep[1]]);
}

export type GithubUpdate = {
  name: string;
  repo: string; // "org/name"
  branch: string;
  current: string; // pinned commit hash, empty when mops.toml pins only a branch
  latest: string;
};

export type GithubUpdateError = {
  name: string;
  message: string;
};

export type GithubUpdates = {
  updates: GithubUpdate[];
  errors: GithubUpdateError[];
};

// `mops update` re-resolves GitHub branches, so anything reporting available updates
// must check them too or it would call a dep up to date that `update` would move.
export async function getAvailableGithubUpdates(
  config: Config,
  pkg?: string,
): Promise<GithubUpdates> {
  let deps = Object.values(config.dependencies || {});
  let devDeps = Object.values(config["dev-dependencies"] || {});
  let githubDeps = [...deps, ...devDeps].filter((dep) => dep.repo);
  if (pkg) {
    githubDeps = githubDeps.filter((dep) => dep.name === pkg);
  }

  // One unauthenticated GitHub API call per repo dep (60/h/IP), so run them
  // concurrently and only for deps actually declared by repo.
  let results = await Promise.all(
    githubDeps.map(
      async (dep): Promise<GithubUpdate | GithubUpdateError | undefined> => {
        let { org, gitName, branch, commitHash } = parseGithubURL(
          dep.repo || "",
        );
        try {
          let commit = await getGithubCommit(`${org}/${gitName}`, branch);
          if (commit.sha === commitHash) {
            return undefined;
          }
          return {
            name: dep.name,
            repo: `${org}/${gitName}`,
            branch,
            current: commitHash,
            latest: commit.sha,
          };
        } catch (err: any) {
          return { name: dep.name, message: err.message };
        }
      },
    ),
  );

  return {
    updates: results.filter(
      (res): res is GithubUpdate => !!res && "latest" in res,
    ),
    errors: results.filter(
      (res): res is GithubUpdateError => !!res && "message" in res,
    ),
  };
}
