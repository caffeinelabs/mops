import { mainActor } from "./actors.js";

export async function getPackageVersions(pkgName: string) {
  let actor = await mainActor();
  return actor.getPackageVersions(pkgName);
}
