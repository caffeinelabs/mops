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

  // `caret-versions` experiment: bare versions resolve as Cargo-style caret
  // ranges. Tested against `core = "1.0.0"` because `core` has 1.0.0 as the
  // only 1.x release, so the caret cap is observable: it stays at 1.0.0
  // while no-flag `mops update` jumps the major to 2.x.
  describe("caret-versions experiment", () => {
    const cwd = path.join(import.meta.dirname, "install/caret");
    const tomlFile = path.join(cwd, "mops.toml");
    const tomlWithFlag = readFileSync(tomlFile, "utf8");
    const tomlWithoutFlag = '[dependencies]\ncore = "1.0.0"\n';

    const cleanup = () => {
      rmSync(path.join(cwd, "mops.lock"), { force: true });
      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
      writeFileSync(tomlFile, tomlWithFlag);
    };

    test("install is reproducible: lock pinned, second install no-op", async () => {
      cleanup();
      try {
        const first = await cli(["install"], { cwd, env: { CI: undefined } });
        expect(first.exitCode).toBe(0);
        const lock1 = readFileSync(path.join(cwd, "mops.lock"), "utf8");
        const second = await cli(["install"], { cwd, env: { CI: undefined } });
        expect(second.exitCode).toBe(0);
        expect(readFileSync(path.join(cwd, "mops.lock"), "utf8")).toBe(lock1);
      } finally {
        cleanup();
      }
    });

    test("mops update stays within the caret bound", async () => {
      cleanup();
      try {
        await cli(["install"], { cwd, env: { CI: undefined } });
        const result = await cli(["update", "core"], {
          cwd,
          env: { CI: undefined },
        });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/up to date/);
        expect(readFileSync(tomlFile, "utf8")).toBe(tomlWithFlag);
      } finally {
        cleanup();
      }
    });

    test("toggling the flag invalidates the lock (CI mode fails loudly)", async () => {
      cleanup();
      try {
        await cli(["install"], { cwd, env: { CI: undefined } });
        writeFileSync(tomlFile, tomlWithoutFlag);
        const result = await cli(["install", "--lock", "check"], { cwd });
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toMatch(/Mismatched \[experimental\] flags hash/);
      } finally {
        cleanup();
      }
    });

    test("mops update without the flag crosses the major (control)", async () => {
      cleanup();
      try {
        writeFileSync(tomlFile, tomlWithoutFlag);
        await cli(["install"], { cwd, env: { CI: undefined } });
        const result = await cli(["update", "core"], {
          cwd,
          env: { CI: undefined },
        });
        expect(result.exitCode).toBe(0);
        const major = readFileSync(tomlFile, "utf8").match(
          /core = "(\d+)\./,
        )?.[1];
        expect(parseInt(major ?? "0")).toBeGreaterThanOrEqual(2);
      } finally {
        cleanup();
      }
    });
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
