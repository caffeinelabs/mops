import { describe, expect, jest, test } from "@jest/globals";
import { rmSync } from "node:fs";
import path from "node:path";
import { cli } from "./helpers";

// Two local packages requiring each other used to recurse through
// installLocalDep -> installDeps -> installLocalDep until the stack overflowed,
// exiting 1 with a raw RangeError that named neither package.
describe("local path dependency cycles", () => {
  jest.setTimeout(120_000);

  const cleanup = (cwd: string) => {
    rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
    rmSync(path.join(cwd, "mops.lock"), { force: true });
  };

  const fixture = (name: string) =>
    path.join(import.meta.dirname, "path-dep-cycle", name);

  test("a -> b -> a installs instead of overflowing the stack", async () => {
    const cwd = fixture("cycle");
    cleanup(cwd);
    try {
      const result = await cli(["install"], { cwd, env: { CI: "1" } });

      expect(result.stderr).not.toMatch(/Maximum call stack size exceeded/);
      expect(result.exitCode).toBe(0);

      // both packages still resolve — the guard stops the walk, not the install
      const sources = await cli(["sources"], { cwd, env: { CI: "1" } });
      expect(sources.exitCode).toBe(0);
      expect(sources.stdout).toMatch(/--package a /);
      expect(sources.stdout).toMatch(/--package b /);
    } finally {
      cleanup(cwd);
    }
  });

  test("a package depending on itself installs", async () => {
    const cwd = fixture("self");
    cleanup(cwd);
    try {
      const result = await cli(["install"], { cwd, env: { CI: "1" } });

      expect(result.stderr).not.toMatch(/Maximum call stack size exceeded/);
      expect(result.exitCode).toBe(0);
    } finally {
      cleanup(cwd);
    }
  });
});
