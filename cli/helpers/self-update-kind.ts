import semver from "semver";

export type SelfUpdateKind = "up-to-date" | "same-major" | "major" | "invalid";

// A new major means breaking changes, so `mops self update` treats crossing
// one as a decision to confirm, not a routine refresh.
export function classifySelfUpdate(
  current: string,
  latest: string,
): SelfUpdateKind {
  if (latest === current) {
    return "up-to-date";
  }
  if (!semver.valid(latest)) {
    return "invalid";
  }
  return semver.major(latest) === semver.major(current)
    ? "same-major"
    : "major";
}
