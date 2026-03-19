export function getDepName(name: string): string {
  return name.split("@")[0] || "";
}

export function getDepPinnedVersion(name: string): string {
  return name.split("@")[1] || "";
}
