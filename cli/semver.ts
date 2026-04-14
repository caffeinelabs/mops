import semver from "semver";

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
