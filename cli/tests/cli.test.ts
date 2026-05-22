import { describe, expect, jest, test } from "@jest/globals";
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "path";
import { cli, normalizePaths } from "./helpers";

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

  // Regression: parallel `mops install` runs against the same project used to
  // race in two places — global cache writes (`.mops/<pkg>` populated mid-write)
  // and local `.mops/<pkg>` copies — leaving zero-byte / partially-written
  // files. See LANG-1310 and caffeinelabs/vscode-motoko#461.
  test("parallel `mops install` produces a complete .mops tree (no zero-byte / staging dirs)", async () => {
    const cwd = path.join(import.meta.dirname, "install/success");
    const lockFile = path.join(cwd, "mops.lock");
    const localCache = path.join(cwd, ".mops");
    rmSync(lockFile, { force: true });
    rmSync(localCache, { recursive: true, force: true });
    try {
      const N = 5;
      const runs = await Promise.all(
        Array.from({ length: N }, () =>
          cli(["install"], { cwd, env: { CI: undefined } }),
        ),
      );
      for (const r of runs) {
        expect({ exitCode: r.exitCode, stderr: r.stderr }).toEqual({
          exitCode: 0,
          stderr: r.stderr,
        });
      }

      const walk = (dir: string): string[] => {
        const out: string[] = [];
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            out.push(...walk(p));
          } else if (entry.isFile()) {
            out.push(p);
          }
        }
        return out;
      };
      const files = walk(localCache);
      const empties = files.filter((f) => statSync(f).size === 0);
      expect(empties).toEqual([]);

      const stagingLeftovers = readdirSync(localCache).filter((e) =>
        e.startsWith(".staging-"),
      );
      expect(stagingLeftovers).toEqual([]);
    } finally {
      rmSync(lockFile, { force: true });
      rmSync(localCache, { recursive: true, force: true });
    }
  });
});

// `mops update` and `mops outdated` default to caret-bound resolution: stay
// within `0.x.y` (or `1.x.y`) and never cross majors. Fixture pins:
//   base = "0.14.5"  -> caret bumps within 0.14.x; --major jumps past it
//   core = "1.0.0"   -> caret stays put (no 1.x.y > 1.0.0); --major jumps to 2.x
describe("update / outdated bounds", () => {
  jest.setTimeout(120_000);

  const cwd = path.join(import.meta.dirname, "install/update-bound");
  const tomlFile = path.join(cwd, "mops.toml");
  const original = readFileSync(tomlFile, "utf8");

  const cleanup = () => {
    rmSync(path.join(cwd, "mops.lock"), { force: true });
    rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
    writeFileSync(tomlFile, original);
  };

  const baseVersion = (toml: string) =>
    toml.match(/base = "(0\.\d+\.\d+)"/)?.[1];
  const coreMajor = (toml: string) =>
    parseInt(toml.match(/core = "(\d+)\./)?.[1] ?? "0");

  test("mops update stays within the caret bound by default", async () => {
    cleanup();
    try {
      await cli(["install"], { cwd, env: { CI: undefined } });
      const result = await cli(["update"], { cwd, env: { CI: undefined } });
      expect(result.exitCode).toBe(0);
      const after = readFileSync(tomlFile, "utf8");
      // base (pre-1.0): bumped within 0.14.x (patch bumps allowed)
      expect(baseVersion(after)).toMatch(/^0\.14\./);
      expect(baseVersion(after)).not.toBe("0.14.5");
      // core (1.x): no 1.x.y > 1.0.0 published, so no bump across majors
      expect(coreMajor(after)).toBe(1);
    } finally {
      cleanup();
    }
  });

  test("mops update --major crosses the caret bound", async () => {
    cleanup();
    try {
      await cli(["install"], { cwd, env: { CI: undefined } });
      const result = await cli(["update", "--major"], {
        cwd,
        env: { CI: undefined },
      });
      expect(result.exitCode).toBe(0);
      const after = readFileSync(tomlFile, "utf8");
      // base: jumps past 0.14.x (next minor or major)
      const baseMinor = parseInt(after.match(/base = "0\.(\d+)\./)?.[1] ?? "0");
      expect(baseMinor).toBeGreaterThanOrEqual(15);
      // core: jumps to 2.x or later
      expect(coreMajor(after)).toBeGreaterThanOrEqual(2);
    } finally {
      cleanup();
    }
  });

  test("mops outdated honors --major flag", async () => {
    cleanup();
    try {
      await cli(["install"], { cwd, env: { CI: undefined } });
      const caret = normalizePaths(
        (await cli(["outdated"], { cwd, env: { CI: undefined } })).stdout,
      );
      const major = normalizePaths(
        (await cli(["outdated", "--major"], { cwd, env: { CI: undefined } }))
          .stdout,
      );
      // caret-bound: base bumps within 0.14.x; core (if reported) stays in 1.x
      expect(caret).toMatch(/base 0\.14\.5 -> 0\.14\./);
      const caretCore = caret.match(/core 1\.0\.0 -> (\d+)\./)?.[1];
      if (caretCore) {
        expect(parseInt(caretCore)).toBe(1);
      }
      // --major: both bump across their major bounds
      expect(major).toMatch(/base 0\.14\.5 -> 0\.(1[5-9]|[2-9]\d)/);
      expect(major).toMatch(/core 1\.0\.0 -> [2-9]/);
    } finally {
      cleanup();
    }
  });
});
