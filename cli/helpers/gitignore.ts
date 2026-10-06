import fs from "node:fs";
import path from "node:path";
import ignore, { type Ignore } from "ignore";

/**
 * `files` without the ones the project's `.gitignore` files exclude.
 *
 * Only `.gitignore` files are read: from the root of the repository the project sits in, down to each file's directory.
 * Not the global excludes file or `.git/info/exclude`, so the selection is the same on every machine, as in mo-fmt's
 * directory walk. Matching is case-sensitive, and whether a file is tracked does not matter.
 *
 * A project that is not in a repository, or that its repository ignores as a whole, reads only its own `.gitignore` files.
 */
export function dropGitIgnored(files: string[], rootDir: string): string[] {
  // `getRootDir()` is "" without a mops.toml; there is no project to read.
  if (!rootDir) {
    return files;
  }
  let root = path.resolve(rootDir);
  let base = repoRoot(root) ?? root;
  let isIgnored = gitIgnoreMatcher(base);
  if (base !== root && isIgnored(root, true)) {
    isIgnored = gitIgnoreMatcher(root);
  }
  return files.filter((file) => !isIgnored(path.resolve(root, file), false));
}

// `.git` is a directory in a clone and a file in a linked worktree or submodule.
function repoRoot(dir: string): string | undefined {
  for (let current = dir; ; current = path.dirname(current)) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return current;
    }
    if (path.dirname(current) === current) {
      return undefined;
    }
  }
}

/**
 * Matches paths below `base` against every `.gitignore` between them.
 *
 * Each directory gets one matcher holding its ancestors' rules followed by its own, rewritten relative to `base`.
 * The last matching rule wins and an ignored directory hides everything below it, which is how git weighs nested files.
 */
function gitIgnoreMatcher(
  base: string,
): (abs: string, isDir: boolean) => boolean {
  let matchers = new Map<string, Ignore>();
  let matcherFor = (dir: string): Ignore => {
    let cached = matchers.get(dir);
    if (cached) {
      return cached;
    }
    let inherited =
      dir === base
        ? ignore({ ignorecase: false })
        : matcherFor(path.dirname(dir));
    let own = readRules(dir, toPosix(path.relative(base, dir)));
    let matcher = own.length
      ? ignore({ ignorecase: false }).add(inherited).add(own)
      : inherited;
    matchers.set(dir, matcher);
    return matcher;
  };

  return (abs, isDir) => {
    let rel = path.relative(base, abs);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
      return false;
    }
    return matcherFor(path.dirname(abs)).ignores(
      toPosix(rel) + (isDir ? "/" : ""),
    );
  };
}

// The rules of `<dir>/.gitignore`, rewritten to match paths relative to the directory `prefix` names.
function readRules(dir: string, prefix: string): string[] {
  let content: string;
  try {
    content = fs.readFileSync(path.join(dir, ".gitignore"), "utf8");
  } catch {
    return [];
  }
  let lines = content
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith("#"));
  if (!prefix) {
    return lines;
  }
  let escapedPrefix = prefix.replace(/[\\*?[\]]|^[#!]/g, "\\$&");
  return lines.map((line) => {
    let negated = line.startsWith("!");
    let pattern = (negated ? line.slice(1) : line).replace(/(?<!\\) +$/, "");
    // A slash anywhere but the end anchors a pattern to its file's directory; without one it matches at any depth.
    let anchored = pattern.slice(0, -1).includes("/");
    let rebased = anchored
      ? `${escapedPrefix}/${pattern.replace(/^\//, "")}`
      : `${escapedPrefix}/**/${pattern}`;
    return (negated ? "!" : "") + rebased;
  });
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}
