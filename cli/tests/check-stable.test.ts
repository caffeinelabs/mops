import { describe, expect, test } from "@jest/globals";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "path";
import { cli, cliSnapshot } from "./helpers";

describe("check-stable", () => {
  test("compatible upgrade from .mo file", async () => {
    const cwd = path.join(import.meta.dirname, "check-stable/compatible");
    await cliSnapshot(["check-stable", "old.mo"], { cwd }, 0);
  });

  test("incompatible upgrade from .mo file", async () => {
    const cwd = path.join(import.meta.dirname, "check-stable/incompatible");
    const result = await cliSnapshot(["check-stable", "old.mo"], { cwd }, 1);
    expect(result.stderr).toMatch(/compatibility/i);
  });

  test("compatible upgrade with verbose", async () => {
    const cwd = path.join(import.meta.dirname, "check-stable/compatible");
    const result = await cli(["check-stable", "old.mo", "--verbose"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Generating stable types for old\.mo/);
    expect(result.stdout).toMatch(/Generating stable types for new\.mo/);
    expect(result.stdout).toMatch(/--stable-compatible/);
    expect(result.stdout).toMatch(/Stable compatibility check passed/);
  });

  test("old file in subdirectory (.old/src/ pattern)", async () => {
    const cwd = path.join(import.meta.dirname, "check-stable/subdirectory");
    const result = await cli(["check-stable", ".old/src/main.mo"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Stable compatibility check passed/);
  });

  test("compatible upgrade from .most file", async () => {
    const cwd = path.join(import.meta.dirname, "check-stable/compatible");
    const tempDir = await mkdtemp(path.join(tmpdir(), "mops-test-most-"));
    try {
      const mostPath = path.join(tempDir, "old.most");
      await writeFile(mostPath, "actor {\n  stable var counter : Nat\n};\n");
      const result = await cli(["check-stable", mostPath], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/Stable compatibility check passed/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("works with relative paths in moc args (e.g. --actor-idl)", async () => {
    const cwd = path.join(import.meta.dirname, "check-stable/actor-idl");
    const result = await cli(["check-stable", "old.mo"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Stable compatibility check passed/);
    expect(existsSync(path.join(cwd, "old.most"))).toBe(false);
    expect(existsSync(path.join(cwd, "old.wasm"))).toBe(false);
    expect(existsSync(path.join(cwd, "new.most"))).toBe(false);
    expect(existsSync(path.join(cwd, "new.wasm"))).toBe(false);
  });

  test("[canisters.X].args are passed to moc (enhanced migration)", async () => {
    const cwd = path.join(import.meta.dirname, "check-stable/canister-args");
    const result = await cli(["check-stable", "old.most"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Stable compatibility check passed/);
  });

  test("no args checks all canisters with [check-stable] config", async () => {
    const cwd = path.join(import.meta.dirname, "check/deployed-compatible");
    const result = await cli(["check-stable"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Stable compatibility check passed/);
  });

  test("canister name filters to specific canister", async () => {
    const cwd = path.join(import.meta.dirname, "check/deployed-compatible");
    const result = await cli(["check-stable", "backend"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Stable compatibility check passed/);
  });

  test("errors when old file does not exist", async () => {
    const cwd = path.join(import.meta.dirname, "check-stable/compatible");
    const result = await cli(["check-stable", "nonexistent.mo"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/File not found/);
  });

  // Regression: two concurrent `mops check-stable` runs on the same project used to clobber
  // each other's `.mops/.check-stable/new.most` and the staged migration symlinks, surfacing
  // as a misleading `new.most: No such file or directory` or an `EEXIST: symlink` crash.
  test("concurrent runs do not clobber each other's scratch state", async () => {
    const cwd = path.join(import.meta.dirname, "check-stable/migrations-chain");
    const results = await Promise.all(
      Array.from({ length: 10 }, () => cli(["check-stable"], { cwd })),
    );
    for (const result of results) {
      expect({
        exitCode: result.exitCode,
        stderr: result.stderr,
      }).toEqual({
        exitCode: 0,
        stderr: "",
      });
      expect(result.stdout).toMatch(/Stable compatibility check passed/);
    }
  }, 60_000);

  test("warns when pending migrations exceed check-limit", async () => {
    const cwd = path.join(
      import.meta.dirname,
      "check-stable/check-limit-warning",
    );
    const result = await cli(["check-stable"], { cwd });
    expect(result.stderr).toMatch(/pending migration\(s\) but check-limit=1/);
    expect(result.stderr).toMatch(/20250201_000000_AddField\.mo/);
    expect(result.stderr).toMatch(/20250301_000000_AddD\.mo/);
  });

  test("does not warn when deployed baseline matches the chain", async () => {
    const cwd = path.join(import.meta.dirname, "check-stable/migrations-chain");
    const result = await cli(["check-stable"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toMatch(/pending migration\(s\) but check-limit/);
  });

  test("--no-check-limit suppresses pending migration warning", async () => {
    const cwd = path.join(
      import.meta.dirname,
      "check-stable/check-limit-warning",
    );
    const result = await cli(["check-stable", "--no-check-limit"], { cwd });
    expect(result.stderr).not.toMatch(/pending migration\(s\) but check-limit/);
  });
});
