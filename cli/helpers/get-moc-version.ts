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

/** First moc that runs the upgrade check inside `moc --check --stable-baseline`. */
export const MOC_STABLE_BASELINE_MIN_VERSION = "1.12.0";

export function supportsStableBaselineCheck(): boolean {
  const version = getMocSemVer();
  return version
    ? version.compare(MOC_STABLE_BASELINE_MIN_VERSION) >= 0
    : false;
}
