import { describe, expect, jest, test } from "@jest/globals";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "path";
import { FILE_PATH_REGEX } from "../constants";
import { normalizeLocalDepPath } from "../helpers/normalize-local-path";
import { cli } from "./helpers";

describe("normalizeLocalDepPath", () => {
  const root = "/proj";

  test("prefixes bare in-tree relatives with ./", () => {
    expect(normalizeLocalDepPath(root, "packages/shared")).toBe(
      "./packages/shared",
    );
    expect(normalizeLocalDepPath(root, "./packages/shared")).toBe(
      "./packages/shared",
    );
  });

  test("keeps parent-relative paths", () => {
    expect(normalizeLocalDepPath(root, "../lib")).toBe("../lib");
    expect(normalizeLocalDepPath(root, "..")).toBe("./..");
  });

  test("maps the root itself to ./", () => {
    expect(normalizeLocalDepPath(root, ".")).toBe("./");
    expect(normalizeLocalDepPath(root, root)).toBe("./");
  });

  test("results always match FILE_PATH_REGEX", () => {
    for (const p of [
      "packages/shared",
      "./packages/shared",
      "../lib",
      ".",
      root,
    ]) {
      expect(normalizeLocalDepPath(root, p)).toMatch(FILE_PATH_REGEX);
    }
  });
});

describe("portable local path deps in mops.lock", () => {
  jest.setTimeout(60_000);

  const cwd = path.join(import.meta.dirname, "install/local-path");
  const lockFile = path.join(cwd, "mops.lock");

  const cleanup = () => {
    rmSync(lockFile, { force: true });
    rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
  };

  const readLockDeps = (): Record<string, string> => {
    const lock = JSON.parse(readFileSync(lockFile, "utf8"));
    return lock.deps;
  };

  test("writes root-relative local paths, not absolute", async () => {
    cleanup();
    try {
      const result = await cli(["install"], { cwd, env: { CI: undefined } });
      expect(result.exitCode).toBe(0);
      expect(existsSync(lockFile)).toBe(true);

      const deps = readLockDeps();
      expect(deps.shared).toBe("./packages/shared");
      expect(deps.sibling).toBe("../local-path-sibling");
      expect(deps.shared).not.toMatch(/^\//);
      expect(deps.sibling).not.toMatch(/^\//);
      expect(deps.shared).toMatch(FILE_PATH_REGEX);
      expect(deps.sibling).toMatch(FILE_PATH_REGEX);
    } finally {
      cleanup();
    }
  });

  test("--lock update rewrites absolute local paths to relative", async () => {
    cleanup();
    try {
      const first = await cli(["install"], { cwd, env: { CI: undefined } });
      expect(first.exitCode).toBe(0);

      const lock = JSON.parse(readFileSync(lockFile, "utf8"));
      lock.deps.shared = path.resolve(cwd, "packages/shared");
      lock.deps.sibling = path.resolve(cwd, "../local-path-sibling");
      writeFileSync(lockFile, JSON.stringify(lock, null, 2));

      const result = await cli(["install", "--lock", "update"], {
        cwd,
        env: { CI: undefined },
      });
      expect(result.exitCode).toBe(0);

      const deps = readLockDeps();
      expect(deps.shared).toBe("./packages/shared");
      expect(deps.sibling).toBe("../local-path-sibling");
    } finally {
      cleanup();
    }
  });

  test("sources from a subdirectory still resolves local deps", async () => {
    cleanup();
    try {
      const install = await cli(["install"], { cwd, env: { CI: undefined } });
      expect(install.exitCode).toBe(0);

      const nested = path.join(cwd, "nested");
      const result = await cli(["sources", "--no-install"], {
        cwd: nested,
        env: { CI: undefined },
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(
        /--package shared \.\.\/packages\/shared\/src/,
      );
      expect(result.stdout).toMatch(
        /--package sibling \.\.\/\.\.\/local-path-sibling\/src/,
      );
    } finally {
      cleanup();
    }
  });
});
