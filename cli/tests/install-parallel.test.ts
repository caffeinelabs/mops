import { describe, expect, jest, test } from "@jest/globals";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cli, useTempFixtures } from "./helpers";

// Packages install through a bounded pool instead of one at a time, and
// transitive deps recurse into that same pool. The set of packages that ends up
// installed must not depend on how the pool interleaved: a dropped package
// breaks every downstream build, and a duplicated one wastes a download.
describe("parallel install", () => {
  jest.setTimeout(300_000);

  const makeTempFixture = useTempFixtures(
    path.join(import.meta.dirname, "install-parallel"),
  );

  const makeTempCacheHome = async () =>
    await mkdtemp(path.join(os.tmpdir(), "mops-parallel-"));

  const localPackages = (cwd: string): string[] =>
    readdirSync(path.join(cwd, ".mops"))
      .filter((entry) => !entry.startsWith("."))
      .sort();

  const readLock = (cwd: string) =>
    JSON.parse(readFileSync(path.join(cwd, "mops.lock"), "utf8"));

  test("installs every package in the graph, transitive levels included", async () => {
    const cwd = await makeTempFixture("graph");
    const cacheHome = await makeTempCacheHome();
    const env = { CI: undefined, XDG_CACHE_HOME: cacheHome };
    const packagesDir = path.join(cacheHome, "mops", "packages");

    try {
      const result = await cli(["install"], { cwd, env });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/Packages installed/);

      // both root registry deps, the alias that shares core's package id, and
      // both local levels — `base` is only reachable through lib -> nested
      expect(readLock(cwd).deps).toEqual({
        core: "1.0.0",
        "core@1": "1.0.0",
        base: "0.16.0",
        lib: "./lib",
        nested: "./lib/nested",
      });

      // nothing the lock records may be missing from `.mops`
      for (const [name, version] of Object.entries(
        readLock(cwd).deps as Record<string, string>,
      )) {
        if (version.startsWith(".")) {
          continue;
        }
        const dir = path.join(cwd, ".mops", `${name.split("@")[0]}@${version}`);
        expect(existsSync(path.join(dir, "mops.toml"))).toBe(true);
      }

      expect(localPackages(cwd)).toEqual(["base@0.16.0", "core@1.0.0"]);
      expect(
        existsSync(path.join(packagesDir, "core@1.0.0", "mops.toml")),
      ).toBe(true);
      expect(
        existsSync(path.join(packagesDir, "base@0.16.0", "mops.toml")),
      ).toBe(true);
    } finally {
      rmSync(cacheHome, { recursive: true, force: true });
    }
  });

  test("two cold installs of the same graph agree byte for byte", async () => {
    const first = await makeTempFixture("graph");
    const second = await makeTempFixture("graph");
    const cacheA = await makeTempCacheHome();
    const cacheB = await makeTempCacheHome();

    try {
      const a = await cli(["install"], {
        cwd: first,
        env: { CI: undefined, XDG_CACHE_HOME: cacheA },
      });
      const b = await cli(["install"], {
        cwd: second,
        env: { CI: undefined, XDG_CACHE_HOME: cacheB },
      });
      expect(a.exitCode).toBe(0);
      expect(b.exitCode).toBe(0);

      // resolution order must not leak from the install pool into the lock
      expect(readFileSync(path.join(second, "mops.lock"), "utf8")).toBe(
        readFileSync(path.join(first, "mops.lock"), "utf8"),
      );
      expect(localPackages(second)).toEqual(localPackages(first));
    } finally {
      rmSync(cacheA, { recursive: true, force: true });
      rmSync(cacheB, { recursive: true, force: true });
    }
  });

  test("a warm install changes nothing", async () => {
    const cwd = await makeTempFixture("graph");
    const cacheHome = await makeTempCacheHome();
    const env = { CI: undefined, XDG_CACHE_HOME: cacheHome };

    try {
      expect((await cli(["install"], { cwd, env })).exitCode).toBe(0);
      const lock = readFileSync(path.join(cwd, "mops.lock"), "utf8");
      const packages = localPackages(cwd);

      const warm = await cli(["install"], { cwd, env });
      expect(warm.exitCode).toBe(0);
      expect(readFileSync(path.join(cwd, "mops.lock"), "utf8")).toBe(lock);
      expect(localPackages(cwd)).toEqual(packages);
    } finally {
      rmSync(cacheHome, { recursive: true, force: true });
    }
  });

  test("one failing package fails the command without an unhandled rejection", async () => {
    const cwd = await makeTempFixture("missing-dep");
    const cacheHome = await makeTempCacheHome();
    const env = { CI: undefined, XDG_CACHE_HOME: cacheHome };

    try {
      const result = await cli(["install"], { cwd, env });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr + result.stdout).toMatch(/nonexistent/);
      expect(result.stderr).not.toMatch(/UnhandledPromiseRejection/);
      expect(result.stderr).not.toMatch(/ERR_UNHANDLED_REJECTION/);

      // siblings that were in flight alongside the failure still committed
      // whole packages to the global cache
      const packagesDir = path.join(cacheHome, "mops", "packages");
      expect(
        existsSync(path.join(packagesDir, "core@1.0.0", "mops.toml")),
      ).toBe(true);
      expect(
        readdirSync(packagesDir).filter((entry) =>
          entry.startsWith(".staging"),
        ),
      ).toEqual([]);
    } finally {
      rmSync(cacheHome, { recursive: true, force: true });
    }
  });
});
