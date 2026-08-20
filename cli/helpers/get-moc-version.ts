import { type SemVer, parse } from "semver";
import { readConfig } from "../mops.js";
import { FILE_PATH_REGEX } from "../constants.js";

export function getMocSemVer(): SemVer | null {
  return parse(getMocVersion());
}

// The `[toolchain] moc` pin, or "" when moc is unpinned or pinned to a path.
// There is nothing else to consult: every command that compiles resolves moc
// through `toolchain.bin("moc")`, which requires the pin.
export function getMocVersion(): string {
  let version = readConfig().toolchain?.moc;
  if (!version || FILE_PATH_REGEX.test(version)) {
    return "";
  }
  return version;
}

/** First moc that runs the upgrade check inside `moc --check --stable-baseline`. */
export const MOC_STABLE_BASELINE_MIN_VERSION = "1.12.0";

// `--stable-baseline` mis-handles a baseline that already contains a migration
// `check-limit` trimmed away: moc demands a field that migration dropped and fails
// a valid upgrade (M0267). Every released moc that accepts the flag has this, so the
// fold is opt-in per build; collapse this into a version floor once the fix ships.
const MOC_STABLE_BASELINE_FIXED_VERSIONS = new Set([
  "1.14.1-fix-stable-baseline",
]);

export function hasStableBaselineFix(): boolean {
  return MOC_STABLE_BASELINE_FIXED_VERSIONS.has(getMocVersion());
}

export function supportsStableBaselineCheck(): boolean {
  const version = getMocSemVer();
  return version
    ? version.compare(MOC_STABLE_BASELINE_MIN_VERSION) >= 0
    : false;
}
