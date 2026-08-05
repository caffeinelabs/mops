import semver from "semver";
import type { SemVer } from "semver";

const ZERO = new semver.SemVer("0.0.0");

/**
 * Registry versions are validated as `x.y.z` by the backend, but the resolver
 * compares git refs (`#v1.2.0-rc.1`) and hand-written `mops.toml` values too,
 * so coerce whatever strict semver rejects rather than throwing on it.
 * Anything with no version in it at all sorts as `0.0.0`.
 */
export function parseVersion(version: string): SemVer {
  return (
    semver.parse(version) ??
    semver.coerce(version, { includePrerelease: true }) ??
    ZERO
  );
}

/** Total order over version strings. Never throws. */
export function compareVersions(
  a: string = "0.0.0",
  b: string = "0.0.0",
): -1 | 0 | 1 {
  return semver.compare(parseVersion(a), parseVersion(b));
}

/** Major of a version string, coerced the same way `compareVersions` does. */
export function majorVersion(version: string): number {
  return parseVersion(version).major;
}
