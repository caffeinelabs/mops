import { describe, expect, jest, test } from "@jest/globals";
import { existsSync, rmSync } from "node:fs";
import path from "path";
import { cli } from "./helpers";

describe("cli", () => {
  test("--version", async () => {
    expect((await cli(["--version"])).stdout).toMatch(/CLI \d+\.\d+\.\d+/);
  });

  test("--help", async () => {
    expect((await cli(["--help"])).stdout).toMatch(/^Usage: mops/m);
  });
});

describe("install", () => {
  jest.setTimeout(120_000);

  test("creates mops.lock automatically on first install", async () => {
    const cwd = path.join(import.meta.dirname, "build/success");
    const lockFile = path.join(cwd, "mops.lock");
    rmSync(lockFile, { force: true });
    try {
      // Unset CI so checkIntegrity uses the local default ("update")
      const result = await cli(["install"], { cwd, env: { CI: undefined } });
      expect(result.exitCode).toBe(0);
      expect(existsSync(lockFile)).toBe(true);
      expect(result.stdout).toMatch(/mops\.lock created/);
    } finally {
      rmSync(lockFile, { force: true });
      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
    }
  });

  test("does not print 'mops.lock created' on subsequent installs", async () => {
    const cwd = path.join(import.meta.dirname, "build/success");
    const lockFile = path.join(cwd, "mops.lock");
    rmSync(lockFile, { force: true });
    try {
      // Unset CI so checkIntegrity uses the local default ("update")
      const first = await cli(["install"], { cwd, env: { CI: undefined } });
      expect(first.exitCode).toBe(0);
      expect(first.stdout).toMatch(/mops\.lock created/);
      const result = await cli(["install"], { cwd, env: { CI: undefined } });
      expect(result.exitCode).toBe(0);
      expect(existsSync(lockFile)).toBe(true);
      expect(result.stdout).not.toMatch(/mops\.lock created/);
    } finally {
      rmSync(lockFile, { force: true });
      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
    }
  });

  test("does not create mops.lock when --lock ignore is passed", async () => {
    const cwd = path.join(import.meta.dirname, "build/success");
    const lockFile = path.join(cwd, "mops.lock");
    rmSync(lockFile, { force: true });
    try {
      // Unset CI for consistency; --lock ignore bypasses auto-detection regardless
      const result = await cli(["install", "--lock", "ignore"], {
        cwd,
        env: { CI: undefined },
      });
      expect(result.exitCode).toBe(0);
      expect(existsSync(lockFile)).toBe(false);
    } finally {
      rmSync(lockFile, { force: true });
      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
    }
  });

  // mops add/remove/update/sync are not separately tested here because they
  // all route through the same checkIntegrity code path tested above.
});
