import { defaultMainActor, mainActor } from "./actors.js";
import { isFallbackActive, markPackageAsFallback } from "./registryFallback.js";

export async function getHighestVersion(pkgName: string) {
  let actor = await mainActor();
  let result = await actor.getHighestVersion(pkgName);

  if ("err" in result && isFallbackActive()) {
    let fallbackActor = await defaultMainActor();
    let fallbackResult = await fallbackActor.getHighestVersion(pkgName);
    if ("ok" in fallbackResult) {
      markPackageAsFallback(pkgName);
      return fallbackResult;
    }
  }

  return result;
}
