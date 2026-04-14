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
 *   ^1.2.3 (major>0) → #major   (highest within same major)
 *   ^0.2.3 (minor>0) → #minor   (highest within same minor)
 *   ^0.0.3            → #patch   (highest within same patch = exact)
 *   ~X.Y.Z            → #minor   (highest within same minor)
 */
export function rangeToSemverPart(spec: string): SemverPart {
  let bare = stripRangePrefix(spec);
  let parsed = semver.parse(bare);
  if (!parsed) return { major: null };

  if (spec.startsWith("~")) {
    return { minor: null };
  }

  // caret
  if (parsed.major !== 0) return { major: null };
  if (parsed.minor !== 0) return { minor: null };
  return { patch: null };
}
