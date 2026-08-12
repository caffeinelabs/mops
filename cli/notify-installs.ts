import { getDependencyType } from "./mops.js";
import { mainOnewayCall } from "./api/actors.js";
import { getDepName } from "./helpers/get-dep-name.js";

export async function notifyInstalls(installedDeps: Record<string, string>) {
  let packages = Object.entries(installedDeps)
    .filter(([_, version]) => getDependencyType(version) === "mops")
    .map(([name, version]) => [getDepName(name), version] as [string, string]);

  if (packages.length) {
    try {
      await mainOnewayCall("notifyInstalls", [packages]);
    } catch (err) {
      // console.error('Failed to notify installs:', err);
    }
  }
}
