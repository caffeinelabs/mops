import { describe, expect, test } from "@jest/globals";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isIgnoredDir, isNestedCheckout } from "../constants.js";

const makeProject = (files: string[]) => {
  let root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "mops-nested-checkout-")),
  );
  for (let file of files) {
    fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), "");
  }
  return root;
};

describe("isNestedCheckout", () => {
  test("a directory outside any nested repo is not skipped", () => {
    let root = makeProject(["src/Main.mo", "test/main.test.mo"]);
    expect(isNestedCheckout(path.join(root, "src/Main.mo"), root)).toBe(false);
    expect(isNestedCheckout("src/Main.mo", root)).toBe(false);
    expect(isNestedCheckout("test/main.test.mo", root)).toBe(false);
  });

  test("roots at or above the project root are not skipped", () => {
    let root = makeProject([".git/HEAD", "src/Main.mo"]);
    // The project's own `.git` bounds the project — it is not a nested repo.
    expect(isNestedCheckout(root, root)).toBe(false);
    expect(isNestedCheckout("src/Main.mo", root)).toBe(false);
    expect(isNestedCheckout(path.join(root, ".."), root)).toBe(false);
  });

  test("skips everything below a nested repo root (directory .git)", () => {
    let root = makeProject([
      "src/Main.mo",
      "vendor/clone/.git/HEAD",
      "vendor/clone/src/Deep.mo",
    ]);
    expect(isNestedCheckout("vendor/clone", root)).toBe(false);
    expect(isNestedCheckout("vendor/clone/src", root)).toBe(true);
    expect(isNestedCheckout("vendor/clone/src/Deep.mo", root)).toBe(true);
    expect(
      isNestedCheckout(path.join(root, "vendor/clone/src/Deep.mo"), root),
    ).toBe(true);
  });

  test("skips everything below a linked worktree (.git as a file)", () => {
    let root = makeProject(["worktree/.git", "worktree/test/main.test.mo"]);
    expect(fs.statSync(path.join(root, "worktree/.git")).isFile()).toBe(true);
    expect(isNestedCheckout("worktree/.git", root)).toBe(true);
    expect(isNestedCheckout("worktree/test/main.test.mo", root)).toBe(true);
  });

  test("only the nested repo's own subtree is skipped", () => {
    let root = makeProject([
      "vendor/clone/.git/HEAD",
      "vendor/clone/src/Main.mo",
      "vendor/Main.mo",
    ]);
    expect(isNestedCheckout("vendor/Main.mo", root)).toBe(false);
    expect(isNestedCheckout("vendor/clone/src/Main.mo", root)).toBe(true);
  });

  test("treats an empty rootDir as no boundary", () => {
    expect(isNestedCheckout("/anywhere/worktree/test/a.test.mo", "")).toBe(
      false,
    );
  });

  // The ancestor memo is keyed by absolute directory. A root-relative key
  // collides across projects — `<rootA>/other` and `<rootB>/other` are the
  // same string — and each verdict then leaks into the other tree, dropping
  // real sources (sticky true) or re-admitting a nested copy (sticky false).
  test("a verdict does not leak between two project roots", () => {
    let a = makeProject(["other/.git/HEAD", "src/A.mo"]);
    let b = makeProject(["other/x.mo", "src/B.mo"]);

    expect(isNestedCheckout(path.join(a, "other/.git/HEAD"), a)).toBe(true);
    expect(isNestedCheckout(path.join(b, "other/x.mo"), b)).toBe(false);
    expect(isNestedCheckout(path.join(b, "src/B.mo"), b)).toBe(false);

    // And the inverse order: a memoized `false` must not hide a real repo.
    let c = makeProject(["src/C.mo"]);
    let d = makeProject(["src/.git/HEAD", "src/D.mo"]);

    expect(isNestedCheckout(path.join(c, "src/C.mo"), c)).toBe(false);
    expect(isNestedCheckout(path.join(d, "src/D.mo"), d)).toBe(true);
  });

  test("absolute and root-relative spellings agree", () => {
    let root = makeProject(["worktree/.git", "worktree/test/copy.test.mo"]);
    expect(isNestedCheckout("worktree/test/copy.test.mo", root)).toBe(true);
    expect(
      isNestedCheckout(path.join(root, "worktree/test/copy.test.mo"), root),
    ).toBe(true);
  });
});

describe("isIgnoredDir", () => {
  let root = makeProject([
    "src/Main.mo",
    "node_modules/pkg/Dep.mo",
    ".mops/dep/Dep.mo",
    ".dfx/build/Out.mo",
    "dist/Out.mo",
    "build/Out.mo",
    "bundle/Out.mo",
  ]);

  test("skips build and dependency directories at any depth", () => {
    expect(isIgnoredDir(path.join(root, "node_modules"), root)).toBe(true);
    expect(isIgnoredDir(path.join(root, "node_modules/pkg/Dep.mo"), root)).toBe(
      true,
    );
    expect(isIgnoredDir(path.join(root, ".mops/dep/Dep.mo"), root)).toBe(true);
    expect(isIgnoredDir(path.join(root, ".dfx/build/Out.mo"), root)).toBe(true);
    expect(isIgnoredDir(path.join(root, "dist/Out.mo"), root)).toBe(true);
    expect(isIgnoredDir(path.join(root, "build/Out.mo"), root)).toBe(true);
    expect(isIgnoredDir(path.join(root, "bundle/Out.mo"), root)).toBe(true);
  });

  test("keeps the project's own sources", () => {
    expect(isIgnoredDir(path.join(root, "src/Main.mo"), root)).toBe(false);
    expect(isIgnoredDir(path.join(root, "src"), root)).toBe(false);
    expect(isIgnoredDir(root, root)).toBe(false);
  });

  test("matches whole path segments, not substrings", () => {
    let partial = makeProject(["mybuild/Out.mo", "dist2/Out.mo"]);
    expect(isIgnoredDir(path.join(partial, "mybuild/Out.mo"), partial)).toBe(
      false,
    );
    expect(isIgnoredDir(path.join(partial, "dist2/Out.mo"), partial)).toBe(
      false,
    );
  });

  test("does not reach outside the project root", () => {
    expect(isIgnoredDir(path.join(root, "..", "node_modules/a.mo"), root)).toBe(
      false,
    );
    expect(isIgnoredDir("/node_modules/a.mo", root)).toBe(false);
  });

  test("treats an empty rootDir as no boundary", () => {
    expect(isIgnoredDir("/anywhere/node_modules/a.mo", "")).toBe(false);
  });
});

// The watchers pass a predicate to chokidar's `ignored`, which *replaces*
// glob-based ignoring. A predicate carrying only the checkout rule silently
// re-admits node_modules/.mops/dist, so pin the watcher's composition itself.
describe("watcher ignore predicate", () => {
  test("skips dependency dirs and nested checkouts, keeps project sources", () => {
    let root = makeProject([
      "src/Main.mo",
      "node_modules/pkg/Dep.mo",
      "worktree/.git",
      "worktree/src/Copy.mo",
    ]);
    let ignored = (p: string) =>
      isIgnoredDir(p, root) || isNestedCheckout(p, root);

    expect(ignored(path.join(root, "src/Main.mo"))).toBe(false);
    expect(ignored(path.join(root, "node_modules/pkg/Dep.mo"))).toBe(true);
    expect(ignored(path.join(root, "node_modules"))).toBe(true);
    expect(ignored(path.join(root, "worktree/src/Copy.mo"))).toBe(true);
  });
});
