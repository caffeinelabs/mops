import process from "node:process";
import chalk from "chalk";
import { mainActor } from "../api/actors.js";
import { Config } from "../types.js";
import { getDepName, getDepPinnedVersion } from "../helpers/get-dep-name.js";
import { SemverPart } from "../declarations/main/main.did.js";
import {
  isRange,
  stripRangePrefix,
  rangeToSemverPart,
} from "../semver.js";
import { checkLockFileLight, readLockFile } from "../integrity.js";

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

  if (depsToUpdate.length === 0) return [];

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

  let lockedDeps: Record<string, string> = {};
  if (checkLockFileLight()) {
    let lockFileJson = readLockFile();
    if (lockFileJson && lockFileJson.version === 3) {
      lockedDeps = lockFileJson.deps;
    }
  }

  // Single batch call for all deps (both ranged and exact)
  let actor = await mainActor();
  let res = await actor.getHighestSemverBatch(
    depsToUpdate.map((dep) => {
      let name = getDepName(dep.name);
      let version = dep.version || "";

      if (isRange(version)) {
        return [name, stripRangePrefix(version), rangeToSemverPart(version)];
      }

      let semverPart: SemverPart = { major: null };
      let pinnedVersion = getDepPinnedVersion(dep.name);
      if (pinnedVersion) {
        semverPart =
          pinnedVersion.split(".").length === 1
            ? { minor: null }
            : { patch: null };
      }
      return [name, version, semverPart];
    }),
  );

  if ("err" in res) {
    console.log(chalk.red("Error:"), res.err);
    process.exit(1);
  }

  return res.ok
    .filter((dep) => {
      let currentConfigVer = getCurrentVersion(dep[0], dep[1]);
      let currentResolved = isRange(currentConfigVer)
        ? lockedDeps[dep[0]] || stripRangePrefix(currentConfigVer)
        : currentConfigVer;
      return currentResolved !== dep[1];
    })
    .map((dep) => [
      dep[0],
      getCurrentVersion(dep[0], dep[1]),
      dep[1],
    ]);
}
