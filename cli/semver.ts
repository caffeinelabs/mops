import semver from "semver";
import type { SemverPart } from "./declarations/main/main.did.js";

export { semver };

export function isRange(spec: string): boolean {
  return spec.startsWith("^") || spec.startsWith("~");
}

export function stripRangePrefix(spec: string): string {
  if (spec.startsWith("^") || spec.startsWith("~")) {
    return spec.slice(1);
  }
  return spec;
}

/**
 * Map a range spec to the SemverPart that getHighestSemverBatch expects.
 *
 * Backend semantics:
 *   #major → any higher version (no constraint)
 *   #minor → highest within same major
 *   #patch → highest within same major.minor
 *
 * Mapping:
 *   ^1.2.3 (major>0) → #minor  (same major)
 *   ^0.2.3 (minor>0) → #patch  (same major.minor)
 *   ^0.0.3            → null    (exact pin, caller must handle)
 *   ~X.Y.Z            → #patch  (same major.minor)
 */
export function rangeToSemverPart(spec: string): SemverPart | null {
  let bare = stripRangePrefix(spec);
  let parsed = semver.parse(bare);
  if (!parsed) {
    return { minor: null };
  }

  if (spec.startsWith("~")) {
    return { patch: null };
  }

  if (parsed.major !== 0) {
    return { minor: null };
  }
  if (parsed.minor !== 0) {
    return { patch: null };
  }
  return null;
}
