import { execFileSync } from "node:child_process";
import { type SemVer, parse } from "semver";
import { readConfig } from "../mops.js";
import { getMocPath } from "./get-moc-path.js";

export function getMocSemVer(mocPath?: string): SemVer | null {
  return parse(getMocVersion(false, mocPath));
}

export function getMocVersion(throwOnError = false, mocPath?: string): string {
  let configVersion = readConfig().toolchain?.moc;
  if (configVersion) {
    return configVersion;
  }

  mocPath = mocPath ?? getMocPath(false);
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
