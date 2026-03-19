import process from "node:process";
import chalk from "chalk";
import { mainActor } from "../api/actors.js";
import { Config } from "../types.js";
import { getDepName, getDepPinnedVersion } from "../helpers/get-dep-name.js";
import { SemverPart } from "../declarations/main/main.did.js";

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

  let actor = await mainActor();
  let res = await actor.getHighestSemverBatch(
    depsToUpdate.map((dep) => {
      let semverPart: SemverPart = { major: null };
      let name = getDepName(dep.name);
      let pinnedVersion = getDepPinnedVersion(dep.name);
      if (pinnedVersion) {
        semverPart =
          pinnedVersion.split(".").length === 1
            ? { minor: null }
            : { patch: null };
      }
      return [name, dep.version || "", semverPart];
    }),
  );

  if ("err" in res) {
    console.log(chalk.red("Error:"), res.err);
    process.exit(1);
  }

  return res.ok
    .filter((dep) => dep[1] !== getCurrentVersion(dep[0], dep[1]))
    .map((dep) => [dep[0], getCurrentVersion(dep[0], dep[1]), dep[1]]);
}
