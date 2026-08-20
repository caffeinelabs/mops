export function getDepName(name: string): string {
  return name.split("@")[0] || "";
}

export function getDepPinnedVersion(name: string): string {
  return name.split("@")[1] || "";
}

// Whether a declared mops.toml key covers `name` at `version`. A key may pin a
// version prefix (`"map@8" = "8.1.0"`), which has to match on a segment
// boundary — otherwise `"map@1"` would claim 10.x and `"map@8"` 80.x.
export function matchesDepKey(
  key: string,
  name: string,
  version: string,
): boolean {
  let pinnedVersion = getDepPinnedVersion(key);
  return (
    getDepName(key) === name &&
    (!pinnedVersion ||
      version === pinnedVersion ||
      version.startsWith(pinnedVersion + "."))
  );
}
