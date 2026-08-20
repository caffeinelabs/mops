import { describe, expect, jest, test } from "@jest/globals";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "path";
import { cli, normalizePaths } from "./helpers";

describe("cli", () => {
  test("--version", async () => {
    expect((await cli(["--version"])).stdout).toMatch(/CLI \d+\.\d+\.\d+/);
  });

  test("--help", async () => {
    expect((await cli(["--help"])).stdout).toMatch(/^Usage: mops/m);
  });

  // Network selection is `MOPS_NETWORK` only. The removed commands persisted
  // it inside the install directory, which is often read-only and shared
  // between projects.
  test.each(["set-network", "sn", "get-network", "gn"])(
    "`%s` is not a command",
    async (name) => {
      const result = await cli([name, "local"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/unknown command/);
    },
  );

  test("MOPS_NETWORK selects the network", async () => {
    const result = await cli(["cache", "show"], {
      env: { MOPS_NETWORK: "staging" },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/mops\/staging$/);
  });

  // These set up and tore down the `DFX_MOC_PATH=moc-wrapper` bridge, which
  // only ever existed to make `dfx build` compile with the pinned moc.
  test.each(["init", "reset"])(
    "`toolchain %s` is not a command",
    async (name) => {
      const result = await cli(["toolchain", name]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/unknown command/);
    },
  );

  test("`watch` no longer offers dfx generate/deploy tasks", async () => {
    const result = await cli(["watch", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/--test/);
    expect(result.stdout).not.toMatch(/--generate|--deploy/);
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

  // `mops add/remove/update/sync` are not separately tested here because they
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

  // `--lock <check|update|ignore>` is gone in v3. `check` became `--locked`,
  // `update` became plain `mops install` (self-healing), and `ignore` has no
  // successor — the lock is always maintained.

  // The `CI` env var used to silently switch install to `--lock check`
  // (deprecated since 2.18). CI must now opt in with `--locked`. See GH #516.
  test("CI=1 no longer forces lockfile check mode", async () => {
    const cwd = path.join(import.meta.dirname, "install/success");
    const lockFile = path.join(cwd, "mops.lock");
    const tomlFile = path.join(cwd, "mops.toml");
    const originalToml = readFileSync(tomlFile, "utf8");
    rmSync(lockFile, { force: true });
    try {
      expect((await cli(["install"], { cwd, env: { CI: "1" } })).exitCode).toBe(
        0,
      );
      // Change mops.toml: under the old CI auto-detection this aborted.
      writeFileSync(
        tomlFile,
        '[dependencies]\ncore = "1.0.0"\nfuzz = "1.0.0"\n',
      );
      const result = await cli(["install"], { cwd, env: { CI: "1" } });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toMatch(/Integrity check failed/);
      expect(result.stdout + result.stderr).not.toMatch(/deprecated/);
      expect(readFileSync(lockFile, "utf8")).toMatch(/fuzz@1\.0\.0/);
    } finally {
      writeFileSync(tomlFile, originalToml);
      rmSync(lockFile, { force: true });
      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
    }
  });

  // Regression: parallel `mops install` runs against the same project used to
  // race in two places — global cache writes (`.mops/<pkg>` populated mid-write)
  // and local `.mops/<pkg>` copies — leaving zero-byte / partially-written
  // files. We isolate the global cache via `XDG_CACHE_HOME` so the global-write
  // path actually executes (cold-cache scenario).
  test("parallel `mops install` produces a complete .mops tree (no zero-byte / staging dirs)", async () => {
    const cwd = path.join(import.meta.dirname, "install/success");
    const lockFile = path.join(cwd, "mops.lock");
    const localCache = path.join(cwd, ".mops");
    const xdgCache = mkdtempSync(path.join(tmpdir(), "mops-test-xdg-"));
    rmSync(lockFile, { force: true });
    rmSync(localCache, { recursive: true, force: true });
    try {
      const N = 5;
      const env = { CI: undefined, XDG_CACHE_HOME: xdgCache };
      const runs = await Promise.all(
        Array.from({ length: N }, () => cli(["install"], { cwd, env })),
      );
      for (const r of runs) {
        if (r.exitCode !== 0) {
          throw new Error(
            `mops install exited ${r.exitCode}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
          );
        }
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

      const globalPkg = path.join(
        xdgCache,
        "mops",
        "packages",
        "core@1.0.0",
        "mops.toml",
      );
      expect(existsSync(globalPkg)).toBe(true);
    } finally {
      rmSync(lockFile, { force: true });
      rmSync(localCache, { recursive: true, force: true });
      rmSync(xdgCache, { recursive: true, force: true });
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

// `--patch` restricts updates to patch versions only, never crossing the minor
// bound. Fixture pins `core = "2.3.0"`; registry has 2.3.1 (patch) and 2.4.0,
// 2.5.0 (minor). Caret default lets minors through; --patch must not.
describe("update / outdated --patch bound", () => {
  jest.setTimeout(120_000);

  const cwd = path.join(import.meta.dirname, "install/update-bound-patch");
  const tomlFile = path.join(cwd, "mops.toml");
  const original = readFileSync(tomlFile, "utf8");

  const cleanup = () => {
    rmSync(path.join(cwd, "mops.lock"), { force: true });
    rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
    writeFileSync(tomlFile, original);
  };

  const coreVersion = (toml: string) =>
    toml.match(/core = "(\d+\.\d+\.\d+)"/)?.[1];

  test("mops update --patch restricts to patch bumps", async () => {
    cleanup();
    try {
      await cli(["install"], { cwd, env: { CI: undefined } });
      const result = await cli(["update", "--patch"], {
        cwd,
        env: { CI: undefined },
      });
      expect(result.exitCode).toBe(0);
      const after = readFileSync(tomlFile, "utf8");
      // Stays within 2.3.x — must not cross to 2.4.0 / 2.5.0
      expect(coreVersion(after)).toMatch(/^2\.3\./);
      expect(coreVersion(after)).not.toBe("2.3.0");
    } finally {
      cleanup();
    }
  });

  test("mops outdated --patch reports patch-only updates", async () => {
    cleanup();
    try {
      await cli(["install"], { cwd, env: { CI: undefined } });
      const patch = normalizePaths(
        (await cli(["outdated", "--patch"], { cwd, env: { CI: undefined } }))
          .stdout,
      );
      // Only 2.3.x updates surface, never 2.4.x / 2.5.x
      expect(patch).toMatch(/core 2\.3\.0 -> 2\.3\./);
      expect(patch).not.toMatch(/core 2\.3\.0 -> 2\.[4-9]/);
    } finally {
      cleanup();
    }
  });

  test.each([["update"], ["outdated"]])(
    "mops %s rejects --major + --patch",
    async (cmd) => {
      const result = await cli([cmd, "--major", "--patch"], {
        cwd,
        env: { CI: undefined },
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(
        /option '--major' cannot be used with option '--patch'/,
      );
    },
  );

  // `update` threads verbose into the installers, the GitHub re-pin and the
  // requirements check, so it needs the same flag its siblings take.
  test("mops update accepts --verbose", async () => {
    const result = await cli(["update", "--verbose", "nosuchpkg"], {
      cwd,
      env: { CI: undefined },
    });
    expect(result.stderr).not.toMatch(/unknown option/);
    expect(result.stdout).toMatch(/Package "nosuchpkg" is not installed!/);
    expect(result.exitCode).toBe(2);
  });

  test("mops update --help lists --verbose", async () => {
    const result = await cli(["update", "--help"]);
    expect(result.stdout).toMatch(/--verbose\s+Show more information/);
  });
});
