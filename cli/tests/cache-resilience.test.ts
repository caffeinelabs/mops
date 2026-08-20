import { describe, expect, jest, test } from "@jest/globals";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cli, useTempFixtures } from "./helpers";

// Regressions for crashes on incomplete global-cache state (raw ENOENT on
// `<cache>/packages/<pkg>@<ver>/mops.toml`): a lock-driven install caches
// only winning versions, so a later stale-lock re-walk used to crash on
// versions that lost a conflict; and an empty cache dir used to count as a
// cache hit. The lock's `graph` section answers the re-walk without touching
// the network at all.
describe("global cache resilience", () => {
  jest.setTimeout(300_000);

  const makeTempFixture = useTempFixtures(
    path.join(import.meta.dirname, "install"),
  );

  const makeTempCacheHome = async () =>
    await mkdtemp(path.join(os.tmpdir(), "mops-cache-"));

  test("add after a lock-driven install resolves losers from the lock graph", async () => {
    const cwd = await makeTempFixture("conflict-loser");
    const cacheHome = await makeTempCacheHome();
    const env = { CI: undefined, XDG_CACHE_HOME: cacheHome };
    const packagesDir = path.join(cacheHome, "mops", "packages");
    const lockFile = path.join(cwd, "mops.lock");

    try {
      // full install populates the cache with every declared version
      // (winner core@1.0.0 and loser core@2.6.1) and writes mops.lock
      const first = await cli(["install"], { cwd, env });
      expect(first.exitCode).toBe(0);

      // the lock records declared edges for every registry version visited
      const lock = JSON.parse(readFileSync(lockFile, "utf8"));
      expect(Object.keys(lock.graph)).toEqual(
        expect.arrayContaining(["core@1.0.0", "core@2.6.1"]),
      );

      // fresh machine: the committed lock survives, caches don't
      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
      rmSync(cacheHome, { recursive: true, force: true });

      // lock-driven install caches only the winning versions
      const second = await cli(["install"], { cwd, env });
      expect(second.exitCode).toBe(0);
      expect(existsSync(path.join(packagesDir, "core@1.0.0"))).toBe(true);
      expect(existsSync(path.join(packagesDir, "core@2.6.1"))).toBe(false);

      // the stale-lock re-walk needs the losing version's edges;
      // the lock graph answers without downloading the package
      const result = await cli(["add", "base@0.16.0"], { cwd, env });
      expect(result.stderr).not.toMatch(/ENOENT/);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/Package installed/);
      expect(existsSync(path.join(packagesDir, "core@2.6.1"))).toBe(false);

      const updated = JSON.parse(readFileSync(lockFile, "utf8"));
      expect(Object.keys(updated.graph)).toEqual(
        expect.arrayContaining(["core@1.0.0", "core@2.6.1", "base@0.16.0"]),
      );
    } finally {
      rmSync(cacheHome, { recursive: true, force: true });
    }
  });

  test("add with a pre-graph lock falls back to fetching losers on demand", async () => {
    const cwd = await makeTempFixture("conflict-loser");
    const cacheHome = await makeTempCacheHome();
    const env = { CI: undefined, XDG_CACHE_HOME: cacheHome };
    const packagesDir = path.join(cacheHome, "mops", "packages");
    const lockFile = path.join(cwd, "mops.lock");

    try {
      const first = await cli(["install"], { cwd, env });
      expect(first.exitCode).toBe(0);

      // locks written by older CLIs carry no graph
      const lock = JSON.parse(readFileSync(lockFile, "utf8"));
      delete lock.graph;
      writeFileSync(lockFile, JSON.stringify(lock, null, 2));

      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
      rmSync(cacheHome, { recursive: true, force: true });

      const second = await cli(["install"], { cwd, env });
      expect(second.exitCode).toBe(0);
      expect(existsSync(path.join(packagesDir, "core@2.6.1"))).toBe(false);

      // without recorded edges the re-walk must download the losing
      // version's manifest instead of crashing with ENOENT
      const result = await cli(["add", "base@0.16.0"], { cwd, env });
      expect(result.stderr).not.toMatch(/ENOENT/);
      expect(result.exitCode).toBe(0);
      expect(
        existsSync(path.join(packagesDir, "core@2.6.1", "mops.toml")),
      ).toBe(true);
    } finally {
      rmSync(cacheHome, { recursive: true, force: true });
    }
  });

  test("stale-lock regeneration carries hashes over; deleting the lock refetches them", async () => {
    const cwd = await makeTempFixture("success");
    const cacheHome = await makeTempCacheHome();
    const env = { CI: undefined, XDG_CACHE_HOME: cacheHome };
    const lockFile = path.join(cwd, "mops.lock");
    const tampered = "0".repeat(64);

    try {
      rmSync(lockFile, { force: true });
      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });

      const first = await cli(["install"], { cwd, env });
      expect(first.exitCode).toBe(0);

      // corrupt one hash in the lock; the deps hash stays valid
      const lock = JSON.parse(readFileSync(lockFile, "utf8"));
      const fileId = Object.keys(lock.hashes["core@1.0.0"])[0] as string;
      const original = lock.hashes["core@1.0.0"][fileId];
      lock.hashes["core@1.0.0"][fileId] = tampered;
      writeFileSync(lockFile, JSON.stringify(lock, null, 2));

      // the maintain flow regenerates the stale lock carrying the corrupt
      // hash over — hashes of already-locked packages are never refetched
      const add = await cli(["add", "base@0.16.0"], { cwd, env });
      expect(add.exitCode).toBe(0);
      const carried = JSON.parse(readFileSync(lockFile, "utf8"));
      expect(carried.hashes["core@1.0.0"][fileId]).toBe(tampered);
      expect(carried.hashes["base@0.16.0"]).toBeDefined();

      // `mops verify` catches the corruption against the registry
      const verify = await cli(["verify"], { cwd, env });
      expect(verify.exitCode).not.toBe(0);

      // recovery per RESTORE_HINT: delete the lock, reinstall — nothing is
      // carried from a missing lock, so every hash comes from the registry
      rmSync(lockFile, { force: true });
      const recover = await cli(["install"], { cwd, env });
      expect(recover.exitCode).toBe(0);
      const refreshed = JSON.parse(readFileSync(lockFile, "utf8"));
      expect(refreshed.hashes["core@1.0.0"][fileId]).toBe(original);
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
