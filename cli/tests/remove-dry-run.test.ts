import { describe, expect, jest, test } from "@jest/globals";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cli, useTempFixtures } from "./helpers";

// `--dry-run` used to delete the local cache entries, print "Package removed",
// and rewrite an already-stale mops.lock through checkIntegrity.
describe("remove --dry-run", () => {
  jest.setTimeout(120_000);

  const makeTempFixture = useTempFixtures(
    path.join(import.meta.dirname, "remove-dry-run"),
  );

  // deliberately disagrees with mops.toml, so any lock maintenance rewrites it
  const staleLock = JSON.stringify({
    version: 3,
    deps: { core: "0.9.0" },
    graph: {},
  });

  test("changes nothing on disk and says so", async () => {
    const cwd = await makeTempFixture("basic");
    const toml = path.join(cwd, "mops.toml");
    const lock = path.join(cwd, "mops.lock");
    const localCache = path.join(cwd, ".mops", "core@1.0.0");

    writeFileSync(lock, staleLock);
    mkdirSync(localCache, { recursive: true });
    writeFileSync(path.join(localCache, "mops.toml"), "[package]\n");

    const tomlBefore = readFileSync(toml, "utf8");

    const res = await cli(["remove", "core", "--dry-run", "--verbose"], {
      cwd,
      env: { CI: "1" },
    });

    expect(res.exitCode).toBe(0);
    expect(res.stdout).toMatch(/Would remove package core = "1\.0\.0"/);
    expect(res.stdout).toMatch(/Would remove local cache .*core@1\.0\.0/);
    expect(res.stdout).not.toMatch(/Package removed/);

    expect(readFileSync(toml, "utf8")).toBe(tomlBefore);
    expect(readFileSync(lock, "utf8")).toBe(staleLock);
    expect(existsSync(path.join(localCache, "mops.toml"))).toBe(true);
  });

  test("reports an unknown package without touching the lock", async () => {
    const cwd = await makeTempFixture("basic");
    const lock = path.join(cwd, "mops.lock");
    writeFileSync(lock, staleLock);

    const res = await cli(["remove", "nope", "--dry-run"], {
      cwd,
      env: { CI: "1" },
    });

    expect(res.stdout).toMatch(/No dependency to remove "nope"/);
    expect(readFileSync(lock, "utf8")).toBe(staleLock);
  });
});
