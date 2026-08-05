import semver from "semver";
import type { SemVer } from "semver";

/**
 * Parse a version string for ordering.
 *
 * Registry versions are validated as `x.y.z` by the backend, but the resolver
 * also orders versions written by hand in `mops.toml`, so coerce whatever
 * strict semver rejects rather than throwing on it. `loose` is load-bearing:
 * the backend accepts leading zeros, so `01.2.3` is publishable and its major
 * is 1 there, while strict semver rejects it outright. Anything with no
 * version in it at all sorts as `0.0.0`.
 *
 * Do not call this on a raw git ref. Coercion picks up the first number-like
 * run anywhere in the string, so a branch named `release-2024` would become
 * `2024.0.0` and outrank every real version. Pull the version out of the ref
 * first — see `gitRefVersion` in `resolve-packages.ts`.
 */
export function parseVersion(version: string): SemVer {
  return (
    semver.parse(version, { loose: true }) ??
    semver.coerce(version, { loose: true, includePrerelease: true }) ??
    // A fresh instance every time: `SemVer` is mutable, and a shared one would
    // let a single caller's `.inc()` poison every later no-version comparison.
    new semver.SemVer("0.0.0")
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
