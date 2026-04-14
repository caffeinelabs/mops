export type RangeType = "exact" | "caret" | "tilde";

export type VersionRange = {
  type: RangeType;
  major: number;
  minor: number;
  patch: number;
};

export type ParsedVersion = [number, number, number];

export function parseVersion(ver: string): ParsedVersion {
  let parts = ver.split(".").map((x) => parseInt(x) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

export function compareVersions(
  a: string = "0.0.0",
  b: string = "0.0.0",
): number {
  let [a0, a1, a2] = parseVersion(a);
  let [b0, b1, b2] = parseVersion(b);
  return Math.sign(a0 - b0) || Math.sign(a1 - b1) || Math.sign(a2 - b2);
}

export function parseRange(spec: string): VersionRange {
  let type: RangeType = "exact";
  let versionStr = spec;

  if (spec.startsWith("^")) {
    type = "caret";
    versionStr = spec.slice(1);
  } else if (spec.startsWith("~")) {
    type = "tilde";
    versionStr = spec.slice(1);
  }

  let [major, minor, patch] = parseVersion(versionStr);
  return { type, major, minor, patch };
}

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
 * Compute the exclusive upper bound for a range.
 *
 * Caret (^) — leftmost non-zero component is the compatibility boundary:
 *   ^1.2.3 → <2.0.0
 *   ^0.2.3 → <0.3.0
 *   ^0.0.3 → <0.0.4
 *
 * Tilde (~) — next minor is the boundary:
 *   ~1.2.3 → <1.3.0
 *   ~0.2.3 → <0.3.0
 */
export function upperBound(range: VersionRange): ParsedVersion {
  let { type, major, minor, patch } = range;

  if (type === "exact") {
    return [major, minor, patch + 1];
  }

  if (type === "tilde") {
    return [major, minor + 1, 0];
  }

  // caret: leftmost non-zero component is the boundary
  if (major !== 0) {
    return [major + 1, 0, 0];
  }
  if (minor !== 0) {
    return [0, minor + 1, 0];
  }
  return [0, 0, patch + 1];
}

export function lowerBound(range: VersionRange): ParsedVersion {
  return [range.major, range.minor, range.patch];
}

function versionGte(v: ParsedVersion, bound: ParsedVersion): boolean {
  return compareVersions(v.join("."), bound.join(".")) >= 0;
}

function versionLt(v: ParsedVersion, bound: ParsedVersion): boolean {
  return compareVersions(v.join("."), bound.join(".")) < 0;
}

export function satisfies(version: string, range: VersionRange): boolean {
  let v = parseVersion(version);
  let lo = lowerBound(range);
  let hi = upperBound(range);
  return versionGte(v, lo) && versionLt(v, hi);
}

/**
 * Find the highest version from a list that satisfies the given range.
 * Returns undefined if no version satisfies.
 */
export function highestSatisfying(
  versions: string[],
  range: VersionRange,
): string | undefined {
  let best: string | undefined;
  for (let v of versions) {
    if (satisfies(v, range) && (!best || compareVersions(v, best) > 0)) {
      best = v;
    }
  }
  return best;
}

/**
 * Format a range back to its string representation.
 */
export function formatRange(range: VersionRange): string {
  let ver = `${range.major}.${range.minor}.${range.patch}`;
  switch (range.type) {
    case "caret":
      return `^${ver}`;
    case "tilde":
      return `~${ver}`;
    case "exact":
      return ver;
  }
}
