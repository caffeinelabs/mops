import fs from "node:fs";
import path from "node:path";

/**
 * Common ignore patterns for glob operations across Motoko files.
 *
 * The trailing `/**` only prunes entries *below* the ignored directory, so an
 * ignore glob can never prune at a checkout boundary — a nested repo root sits
 * next to its `.git`, not under it. See `isNestedCheckout`.
 *
 * `build`/`bundle` are not mops output; they are dirs users may still have
 * lying around from other tooling, and they hold copies of the project's
 * sources. Widen `isIgnoredDir` alongside this list.
 */
export const MOTOKO_IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/.mops/**",
  "**/.git/**",
  // not dfx support — just a build dir users may still have lying around
  "**/.dfx/**",
  "**/dist/**",
  "**/{build,bundle}/**",
];

/**
 * Common glob configuration for Motoko file operations
 */
export const MOTOKO_GLOB_CONFIG = {
  nocase: true,
  ignore: MOTOKO_IGNORE_PATTERNS,
};

const nestedCheckoutCache = new Map<string, boolean>();

/**
 * True when any ancestor of `absPath` strictly below `rootDir` is its own
 * checkout — a linked git worktree, a submodule, or a plain nested clone.
 *
 * Such a directory holds a `.git` entry that is a file (worktree, submodule)
 * or a directory (clone), and `MOTOKO_IGNORE_PATTERNS` prunes neither the
 * directory itself nor anything beside it, so its sources would otherwise be
 * picked up as the project's.
 */
export function isNestedCheckout(absPath: string, rootDir: string): boolean {
  // `getRootDir()` is "" without a mops.toml; there is no boundary to walk to.
  if (!rootDir) {
    return false;
  }
  let root = path.resolve(rootDir);
  let dir = absPath;
  // Glob results arrive in two spellings: absolute (a root-prefixed glob) and
  // root-relative (a `cwd`-relative glob). Only the former can be stripped back
  // to a relative path — `path.resolve` would anchor the latter to the process
  // cwd, not the project root.
  if (dir.startsWith(root + path.sep)) {
    dir = dir.slice(root.length + 1);
  }
  dir = path.dirname(dir);
  if (!dir || dir === "." || dir.startsWith("..")) {
    return false;
  }

  let cached = nestedCheckoutCache.get(dir);
  if (cached !== undefined) {
    return cached;
  }

  let nested = false;
  let current = "";
  for (let part of dir.split(path.sep)) {
    if (!part || part === ".") {
      continue;
    }
    current = current ? path.join(current, part) : part;
    // Memoizing the ancestor answers "is this *directory* a repo root", which
    // makes the walk stop at the first one on every later path.
    let isRepo = nestedCheckoutCache.get(current);
    if (isRepo ?? fs.existsSync(path.resolve(root, current, ".git"))) {
      nested = true;
      if (isRepo === undefined) {
        nestedCheckoutCache.set(current, true);
      }
      break;
    }
    nestedCheckoutCache.set(current, false);
  }

  nestedCheckoutCache.set(dir, nested);
  return nested;
}

/**
 * True when `absPath` is inside one of the build/dependency directories that
 * `MOTOKO_IGNORE_PATTERNS` prunes for glob callers.
 *
 * chokidar's `ignored` takes a predicate, and a chokidar predicate *replaces*
 * glob-based ignoring rather than adding to it — so the watchers need the
 * pruning rule expressed as a path test, not just `isNestedCheckout`.
 */
export function isIgnoredDir(absPath: string, rootDir: string): boolean {
  if (!rootDir) {
    return false;
  }
  let rel = path.relative(path.resolve(rootDir), path.resolve(absPath));
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    return false;
  }
  return rel
    .split(path.sep)
    .some(
      (part) =>
        part === "node_modules" ||
        part === ".mops" ||
        part === ".git" ||
        part === ".dfx" ||
        part === "dist" ||
        part === "build" ||
        part === "bundle",
    );
}

/**
 * Regex to match a file path for dependency and toolchain versions
 */
export const FILE_PATH_REGEX = /^(\.?\.)?\//;
