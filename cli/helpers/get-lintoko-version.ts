import { execFileSync } from "node:child_process";
import { type SemVer, parse } from "semver";
import { FILE_PATH_REGEX } from "../constants.js";
import { readConfig } from "../mops.js";

export function getLintokoSemVer(): SemVer | null {
  return parse(getLintokoVersion(false));
}

export function getLintokoVersion(throwOnError = false): string {
  let configVersion = readConfig().toolchain?.lintoko;
  if (!configVersion) {
    return "";
  }
  if (!configVersion.match(FILE_PATH_REGEX)) {
    return configVersion;
  }

  try {
    let match = execFileSync(configVersion, ["--version"])
      .toString()
      .trim()
      .match(/lintoko ([^\s]+)/);
    return match?.[1] || "";
  } catch (e) {
    if (throwOnError) {
      console.error(e);
      throw new Error("lintoko not found");
    }
    return "";
  }
}
