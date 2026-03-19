import { mainActor } from "./actors.js";

export async function getHighestVersion(pkgName: string) {
  let actor = await mainActor();
  return actor.getHighestVersion(pkgName);
}
