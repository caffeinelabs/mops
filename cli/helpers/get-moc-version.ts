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

// First moc where `--stable-baseline` gets the upgrade check right: earlier
// builds that accept the flag mishandle a baseline already past a migration
// `check-limit` trimmed away, failing valid upgrades with a bogus M0267.
export const MOC_STABLE_BASELINE_MIN_VERSION = "1.15.0";

export function supportsStableBaselineCheck(): boolean {
  const version = getMocSemVer();
  return version
    ? version.compare(MOC_STABLE_BASELINE_MIN_VERSION) >= 0
    : false;
}

// First moc where `moc --check a.mo b.mo` checks each file on its own.
// Earlier ones concatenate the files into one program, so a file could use
// another's declarations without importing them.
export const MOC_MULTI_FILE_CHECK_MIN_VERSION = "2.0.0";

// Splits files into `moc --check` runs: one run for all of them where moc
// checks each file on its own, else one run per file.
export function mocCheckRuns(files: string[]): string[][] {
  const version = getMocSemVer();
  return version && version.compare(MOC_MULTI_FILE_CHECK_MIN_VERSION) >= 0
    ? [files]
    : files.map((file) => [file]);
}
