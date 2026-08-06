import { describe, expect, jest, test } from "@jest/globals";
import { existsSync, rmSync } from "node:fs";
import path from "path";
import { cli } from "./helpers";

// `repo = "..."` deps are served by installFromGithub, which lived in
// vessel.ts until v3 dropped vessel. Regression cover for the move.
describe("install github dep", () => {
  jest.setTimeout(120_000);

  test("installs a pinned repo dependency", async () => {
    const cwd = path.join(import.meta.dirname, "install/github-dep");
    const lockFile = path.join(cwd, "mops.lock");
    const depDir = path.join(
      cwd,
      ".mops/_github/test#master@06d7c77accb9fb08830643aa8f0e346295f6b263",
    );
    rmSync(lockFile, { force: true });
    rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
    try {
      const result = await cli(["install"], { cwd, env: { CI: undefined } });
      expect(result.exitCode).toBe(0);
      expect(existsSync(path.join(depDir, "src"))).toBe(true);
      expect(existsSync(lockFile)).toBe(true);

      // second run is served from the global cache
      const cached = await cli(["install"], { cwd, env: { CI: undefined } });
      expect(cached.exitCode).toBe(0);
      expect(cached.stdout + cached.stderr).toMatch(/\(cache\)/);
    } finally {
      rmSync(lockFile, { force: true });
      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
    }
  });
});
