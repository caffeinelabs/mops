import { describe, expect, jest, test } from "@jest/globals";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    const cwd = path.join(import.meta.dirname, "install/success");
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
    const cwd = path.join(import.meta.dirname, "install/success");
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
    const cwd = path.join(import.meta.dirname, "install/success");
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

  // Regression: aliases pinning the same package@version (e.g. `core` and
  // `core@1` both at "1.0.0") inflated the resolved-packageIds count and
  // tripped the lockfile integrity check with a spurious
  // "Mismatched number of resolved packages" error. See issue #506.
  test("integrity check passes when aliases resolve to the same package@version", async () => {
    const cwd = path.join(import.meta.dirname, "install/aliases");
    const lockFile = path.join(cwd, "mops.lock");
    rmSync(lockFile, { force: true });
    try {
      const result = await cli(["install"], { cwd, env: { CI: undefined } });
      expect(result.stderr).not.toMatch(
        /Mismatched number of resolved packages/,
      );
      expect(result.exitCode).toBe(0);
      expect(existsSync(lockFile)).toBe(true);
    } finally {
      rmSync(lockFile, { force: true });
      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
    }
  });

  // Regression: `install --lock update` used to early-return if mops.toml's
  // deps hash was unchanged, even when the lockfile's per-file hashes were
  // stale/corrupt. The subsequent checkLockFile would then fail and exit 1,
  // so `--lock update` could never recover a broken lock — the only escape
  // was `rm mops.lock`. See issue #514.
  test("--lock update rewrites a lockfile with a corrupt file hash", async () => {
    const cwd = path.join(import.meta.dirname, "install/success");
    const lockFile = path.join(cwd, "mops.lock");
    rmSync(lockFile, { force: true });
    try {
      const first = await cli(["install"], { cwd, env: { CI: undefined } });
      expect(first.exitCode).toBe(0);
      expect(existsSync(lockFile)).toBe(true);

      const bad =
        "BAD0000000000000000000000000000000000000000000000000000000000BAD";
      const original = readFileSync(lockFile, "utf8");
      const corrupted = original.replace(
        /"core@1\.0\.0\/mops\.toml":\s*"[0-9a-f]{64}"/,
        `"core@1.0.0/mops.toml": "${bad}"`,
      );
      expect(corrupted).not.toBe(original);
      writeFileSync(lockFile, corrupted);

      const result = await cli(["install", "--lock", "update"], {
        cwd,
        env: { CI: undefined },
      });
      expect(result.exitCode).toBe(0);
      expect(readFileSync(lockFile, "utf8")).not.toContain(bad);
    } finally {
      rmSync(lockFile, { force: true });
      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
    }
  });
});
