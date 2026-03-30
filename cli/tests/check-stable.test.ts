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

  test("errors when old file does not exist", async () => {
    const cwd = path.join(import.meta.dirname, "check-stable/compatible");
    const result = await cli(["check-stable", "nonexistent.mo"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/File not found/);
  });
});
