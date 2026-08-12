import { describe, expect, jest, test } from "@jest/globals";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cli, useTempFixtures } from "./helpers";

// Regressions for crashes on incomplete global-cache state (raw ENOENT on
// `<cache>/packages/<pkg>@<ver>/mops.toml`): a lock-driven install caches
// only winning versions, so a later stale-lock re-walk used to crash on
// versions that lost a conflict; and an empty cache dir used to count as a
// cache hit.
describe("global cache resilience", () => {
  jest.setTimeout(300_000);

  const makeTempFixture = useTempFixtures(
    path.join(import.meta.dirname, "install"),
  );

  const makeTempCacheHome = async () =>
    await mkdtemp(path.join(os.tmpdir(), "mops-cache-"));

  test("add after a lock-driven install fetches conflict losers instead of crashing", async () => {
    const cwd = await makeTempFixture("conflict-loser");
    const cacheHome = await makeTempCacheHome();
    const env = { CI: undefined, XDG_CACHE_HOME: cacheHome };
    const packagesDir = path.join(cacheHome, "mops", "packages");

    try {
      // full install populates the cache with every declared version
      // (winner core@1.0.0 and loser core@2.6.1) and writes mops.lock
      const first = await cli(["install"], { cwd, env });
      expect(first.exitCode).toBe(0);
      expect(existsSync(path.join(cwd, "mops.lock"))).toBe(true);

      // fresh machine: the committed lock survives, caches don't
      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
      rmSync(cacheHome, { recursive: true, force: true });

      // lock-driven install caches only the winning versions
      const second = await cli(["install"], { cwd, env });
      expect(second.exitCode).toBe(0);
      expect(existsSync(path.join(packagesDir, "core@1.0.0"))).toBe(true);
      expect(existsSync(path.join(packagesDir, "core@2.6.1"))).toBe(false);

      // the stale-lock re-walk visits the losing version's manifest;
      // it must be fetched on demand, not crash with ENOENT
      const result = await cli(["add", "base@0.16.0"], { cwd, env });
      expect(result.stderr).not.toMatch(/ENOENT/);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/Package installed/);
      expect(
        existsSync(path.join(packagesDir, "core@2.6.1", "mops.toml")),
      ).toBe(true);
    } finally {
      rmSync(cacheHome, { recursive: true, force: true });
    }
  });

  test("empty global cache dir counts as a miss and is re-downloaded", async () => {
    const cwd = await makeTempFixture("success");
    const cacheHome = await makeTempCacheHome();
    const env = { CI: undefined, XDG_CACHE_HOME: cacheHome };
    const coreDir = path.join(cacheHome, "mops", "packages", "core@1.0.0");

    try {
      rmSync(path.join(cwd, "mops.lock"), { force: true });
      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });

      // interrupted-run leftover: the dir exists but holds no package
      mkdirSync(coreDir, { recursive: true });

      const result = await cli(["install"], { cwd, env });
      expect(result.stderr).not.toMatch(/ENOENT/);
      expect(result.exitCode).toBe(0);
      expect(existsSync(path.join(coreDir, "mops.toml"))).toBe(true);
    } finally {
      rmSync(cacheHome, { recursive: true, force: true });
    }
  });
});
