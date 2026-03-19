import { execFileSync } from "node:child_process";
import { type SemVer, parse } from "semver";
import { readConfig } from "../mops.js";
import { getMocPath } from "./get-moc-path.js";

export function getMocSemVer(): SemVer | null {
  return parse(getMocVersion(false));
}

export function getMocVersion(throwOnError = false): string {
  let configVersion = readConfig().toolchain?.moc;
  if (configVersion) {
    return configVersion;
  }

  const mocPath = getMocPath(false);
  if (!mocPath) {
    return "";
  }
  try {
    let match = execFileSync(mocPath, ["--version"])
      .toString()
      .trim()
      .match(/Motoko compiler ([^\s]+) .*/);
    return match?.[1] || "";
  } catch (e) {
    if (throwOnError) {
      console.error(e);
      throw new Error("moc not found");
    }
    return "";
  }
}
