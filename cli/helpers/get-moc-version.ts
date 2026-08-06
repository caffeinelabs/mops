import { type SemVer, parse } from "semver";
import { readConfig } from "../mops.js";

export function getMocSemVer(): SemVer | null {
  return parse(getMocVersion());
}

// The `[toolchain] moc` pin, or "" when moc is unpinned or pinned to a path.
// There is nothing else to consult: every command that compiles resolves moc
// through `toolchain.bin("moc")`, which requires the pin.
export function getMocVersion(): string {
  return readConfig().toolchain?.moc || "";
}
