import { getDependencyType } from "./mops.js";
import { mainActor } from "./api/actors.js";
import { getDepName } from "./helpers/get-dep-name.js";

export async function notifyInstalls(installedDeps: Record<string, string>) {
  let packages = Object.entries(installedDeps)
    .filter(([_, version]) => getDependencyType(version) === "mops")
    .map(([name, version]) => [getDepName(name), version] as [string, string]);

  if (packages.length) {
    let actor = await mainActor();

    try {
      await actor.notifyInstalls(packages);
    } catch (err) {
      // console.error('Failed to notify installs:', err);
    }
  }
}
