import { execFileSync } from "node:child_process";
import { type SemVer, parse } from "semver";
import { readConfig } from "../mops.js";

export function getLintokoSemVer(): SemVer | null {
  return parse(getLintokoVersion(false));
}

export function getLintokoVersion(throwOnError = false): string {
  let configVersion = readConfig().toolchain?.lintoko;
  if (configVersion) {
    return configVersion;
  }

  try {
    let match = execFileSync("lintoko", ["--version"])
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
