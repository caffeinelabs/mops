import { describe, expect, jest, test } from "@jest/globals";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "path";
import { cli, useTempFixtures } from "./helpers";

// `repo = "..."` deps are served by installFromGithub, which lived in
// vessel.ts until v3 dropped vessel. Regression cover for the move, and for
// the extractor swap this path still needs — it is the last `decompress` user.
//
// These download from github.com, the way the registry-backed tests in
// cli.test.ts hit the mops registry. Deps are pinned to a commit so the
// archive is immutable; only the `add` case resolves a branch, which is the
// behavior that test exists to check.
const REPO = "https://github.com/ZenVoich/test";
const COMMIT = "06d7c77accb9fb08830643aa8f0e346295f6b263";
const PINNED_DEP =
  /test = "https:\/\/github\.com\/ZenVoich\/test#main@[0-9a-f]{40}"/;

describe("install github dep", () => {
  jest.setTimeout(120_000);

  const makeTempFixture = useTempFixtures(
    path.join(import.meta.dirname, "install"),
  );

  test("installs a pinned repo dependency", async () => {
    const cwd = path.join(import.meta.dirname, "install/github-dep");
    const lockFile = path.join(cwd, "mops.lock");
    const depDir = path.join(cwd, ".mops/_github", `test#master@${COMMIT}`);
    rmSync(lockFile, { force: true });
    rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
    try {
      const result = await cli(["install"], { cwd, env: { CI: undefined } });
      expect(result.exitCode).toBe(0);
      // `strip: 1` drops the archive's top level, so package files sit
      // directly inside the dep dir.
      expect(existsSync(path.join(depDir, "src"))).toBe(true);
      expect(existsSync(path.join(depDir, "mops.toml"))).toBe(true);
      expect(existsSync(lockFile)).toBe(true);

      // The repo url is recorded verbatim, so the lock pins the commit too.
      const lock = JSON.parse(readFileSync(lockFile, "utf8"));
      expect(lock.deps["test"]).toBe(`${REPO}#master@${COMMIT}`);

      // Landing on disk is not enough — the dep has to reach moc as a
      // --package flag.
      const sources = await cli(["sources", "--no-install"], {
        cwd,
        env: { CI: undefined },
      });
      expect(sources.exitCode).toBe(0);
      expect(sources.stdout).toContain(
        `--package test .mops/_github/test#master@${COMMIT}/src`,
      );

      // second run is served from the global cache
      const cached = await cli(["install"], { cwd, env: { CI: undefined } });
      expect(cached.exitCode).toBe(0);
      expect(cached.stdout + cached.stderr).toMatch(/\(cache\)/);
    } finally {
      rmSync(lockFile, { force: true });
      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
    }
  });

  test("add resolves a branch to a commit and pins it", async () => {
    const cwd = await makeTempFixture("github-add");

    const result = await cli(["add", `${REPO}#main`], {
      cwd,
      env: { CI: undefined },
    });
    expect(result.exitCode).toBe(0);

    // Pinning the resolved commit is what makes a branch dep reproducible.
    expect(readFileSync(path.join(cwd, "mops.toml"), "utf8")).toMatch(
      PINNED_DEP,
    );

    const lock = JSON.parse(readFileSync(path.join(cwd, "mops.lock"), "utf8"));
    expect(lock.deps["test"]).toMatch(
      /^https:\/\/github\.com\/ZenVoich\/test#main@[0-9a-f]{40}$/,
    );

    const commit = lock.deps["test"].split("@")[1];
    expect(
      existsSync(path.join(cwd, ".mops/_github", `test#main@${commit}/src`)),
    ).toBe(true);
  });

  test("add leaves mops.toml untouched when the repo does not exist", async () => {
    const cwd = await makeTempFixture("github-add");
    const missing = "https://github.com/caffeinelabs/does-not-exist-4a1c9f";

    const result = await cli(["add", `${missing}#main`], {
      cwd,
      env: { CI: undefined },
    });
    expect(result.exitCode).not.toBe(0);
    expect(readFileSync(path.join(cwd, "mops.toml"), "utf8")).not.toContain(
      "does-not-exist",
    );
  });
});
