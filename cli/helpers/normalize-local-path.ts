import path from "node:path";

/**
 * Root-relative local dep path that always matches FILE_PATH_REGEX
 * (`./…` or `../…`). Uses posix separators for portable locks.
 */
export function normalizeLocalDepPath(
  rootDir: string,
  depPath: string,
): string {
  let rel = path.relative(rootDir, path.resolve(rootDir, depPath));
  rel = rel.split(path.sep).join("/");
  if (rel === "" || rel === ".") {
    return "./";
  }
  if (rel.startsWith("../") || rel.startsWith("./")) {
    return rel;
  }
  return `./${rel}`;
}
