import process from "node:process";
import chalk from "chalk";
import { mainActor } from "../api/actors.js";
import { getPackageVersions } from "../api/getPackageVersions.js";
import { Config } from "../types.js";
import { getDepName, getDepPinnedVersion } from "../helpers/get-dep-name.js";
import { SemverPart } from "../declarations/main/main.did.js";
import {
  isRange,
  parseRange,
  highestSatisfying,
  stripRangePrefix,
} from "../semver.js";

// [pkg, oldVersion, newVersion]
export async function getAvailableUpdates(
  config: Config,
  pkg?: string,
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

  // Split into ranged and non-ranged deps
  let rangedDeps = depsToUpdate.filter((dep) => isRange(dep.version || ""));
  let exactDeps = depsToUpdate.filter((dep) => !isRange(dep.version || ""));

  let results: Array<[string, string]> = [];

  // Resolve ranged deps using getPackageVersions + local filtering
  let rangedResults = await Promise.all(
    rangedDeps.map(async (dep) => {
      let name = getDepName(dep.name);
      let range = parseRange(dep.version || "");
      let versionsRes = await getPackageVersions(name);
      if ("err" in versionsRes) return null;
      let highest = highestSatisfying(versionsRes.ok, range);
      return highest ? ([name, highest] as [string, string]) : null;
    }),
  );
  for (let r of rangedResults) {
    if (r) results.push(r);
  }

  // Resolve exact deps using existing getHighestSemverBatch
  if (exactDeps.length > 0) {
    let actor = await mainActor();
    let res = await actor.getHighestSemverBatch(
      exactDeps.map((dep) => {
        let semverPart: SemverPart = { major: null };
        let name = getDepName(dep.name);
        let pinnedVersion = getDepPinnedVersion(dep.name);
        if (pinnedVersion) {
          semverPart =
            pinnedVersion.split(".").length === 1
              ? { minor: null }
              : { patch: null };
        }
        return [name, stripRangePrefix(dep.version || ""), semverPart];
      }),
    );

    if ("err" in res) {
      console.log(chalk.red("Error:"), res.err);
      process.exit(1);
    }

    results.push(...res.ok);
  }

  return results
    .filter((dep) => {
      let current = getCurrentVersion(dep[0], dep[1]);
      return stripRangePrefix(current) !== dep[1];
    })
    .map((dep) => [
      dep[0],
      getCurrentVersion(dep[0], dep[1]),
      dep[1],
    ]);
}
