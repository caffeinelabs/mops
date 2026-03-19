import { getHighestVersion } from "./getHighestVersion.js";

export async function resolveVersion(
  pkg: string,
  version = "",
): Promise<string> {
  if (!version) {
    let versionRes = await getHighestVersion(pkg);
    if ("err" in versionRes) {
      throw versionRes.err;
    }
    version = versionRes.ok;
  }
  return version;
}
