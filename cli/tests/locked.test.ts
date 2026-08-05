import { describe, expect, jest, test } from "@jest/globals";
import {
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "path";
import { cli } from "./helpers";

// `--locked` is the CI flow: never write mops.lock, fail loudly when it is
// missing or when it no longer agrees with mops.toml and the registry.
// Error paths use targeted assertions rather than snapshots (see AGENTS.md).
describe("--locked", () => {
  jest.setTimeout(180_000);

  // Dedicated fixture: Jest runs test files in parallel, so sharing
  // `install/success` with cli.test.ts would race on mops.lock / .mops.
  const cwd = path.join(import.meta.dirname, "install/locked");
  const lockFile = path.join(cwd, "mops.lock");
  const tomlFile = path.join(cwd, "mops.toml");
  const originalToml = readFileSync(tomlFile, "utf8");

  const cleanup = () => {
    writeFileSync(tomlFile, originalToml);
    rmSync(lockFile, { force: true });
    rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
  };

  const install = async () => {
    const result = await cli(["install"], { cwd, env: { CI: undefined } });
    expect(result.exitCode).toBe(0);
    return result;
  };

  const readLock = () => JSON.parse(readFileSync(lockFile, "utf8"));
  const writeLock = (lock: unknown) =>
    writeFileSync(lockFile, JSON.stringify(lock, null, 2));

  test("fails when mops.lock is missing", async () => {
    cleanup();
    try {
      const result = await cli(["install", "--locked"], {
        cwd,
        env: { CI: undefined },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/mops\.lock is missing, but --locked/);
      expect(result.stderr).toMatch(/Run `mops install` to generate it/);
      expect(existsSync(lockFile)).toBe(false);
    } finally {
      cleanup();
    }
  });

  // CI pipelines commonly run `mops test` with no prior install, so every
  // implicitly-resolving command must honor --locked too.
  test.each([["build"], ["check"], ["check-stable"], ["test"], ["bench"]])(
    "mops %s --locked fails on a missing lock without installing",
    async (cmd) => {
      cleanup();
      try {
        const result = await cli([cmd, "--locked"], {
          cwd,
          env: { CI: undefined },
        });
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toMatch(/mops\.lock is missing, but --locked/);
        expect(existsSync(lockFile)).toBe(false);
      } finally {
        cleanup();
      }
    },
  );

  test("passes on an up-to-date lock and does not rewrite it", async () => {
    cleanup();
    try {
      await install();
      const before = readFileSync(lockFile, "utf8");
      const beforeMtime = statSync(lockFile).mtimeMs;

      const result = await cli(["install", "--locked"], {
        cwd,
        env: { CI: undefined },
      });
      expect(result.exitCode).toBe(0);
      expect(readFileSync(lockFile, "utf8")).toBe(before);
      expect(statSync(lockFile).mtimeMs).toBe(beforeMtime);
    } finally {
      cleanup();
    }
  });

  test("fails when mops.toml changed since the lock was written", async () => {
    cleanup();
    try {
      await install();
      const before = readFileSync(lockFile, "utf8");
      writeFileSync(
        tomlFile,
        '[dependencies]\ncore = "1.0.0"\nfuzz = "1.0.0"\n',
      );

      const result = await cli(["install", "--locked"], {
        cwd,
        env: { CI: undefined },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/mops\.toml has changed since mops\.lock/);
      expect(result.stderr).toMatch(/Run `mops install` \(without --locked\)/);
      // Never writes the lock, not even partially.
      expect(readFileSync(lockFile, "utf8")).toBe(before);
    } finally {
      cleanup();
    }
  });

  test("fails on an unparseable lock", async () => {
    cleanup();
    try {
      writeFileSync(lockFile, "{ not json");
      const result = await cli(["install", "--locked"], {
        cwd,
        env: { CI: undefined },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/mops\.lock could not be parsed/);
      expect(readFileSync(lockFile, "utf8")).toBe("{ not json");
    } finally {
      cleanup();
    }
  });

  test("fails on a legacy lock format", async () => {
    cleanup();
    try {
      await install();
      const lock = readLock();
      delete lock.deps;
      lock.version = 2;
      writeLock(lock);

      const result = await cli(["install", "--locked"], {
        cwd,
        env: { CI: undefined },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(
        /mops\.lock is version 2, but the current format is 3/,
      );
    } finally {
      cleanup();
    }
  });

  test("fails when a locked version disagrees with mops.toml", async () => {
    cleanup();
    try {
      await install();
      const lock = readLock();
      lock.deps.core = "2.0.0";
      writeLock(lock);

      const result = await cli(["install", "--locked"], {
        cwd,
        env: { CI: undefined },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(
        /dependency core: mops\.toml declares 1\.0\.0, mops\.lock has 2\.0\.0/,
      );
      // Caught before anything is downloaded.
      expect(existsSync(path.join(cwd, ".mops", "core@2.0.0"))).toBe(false);
    } finally {
      cleanup();
    }
  });

  // Replaces the old #514 regression test. A corrupted hash *value* still
  // satisfies every staleness check, so plain `mops install` does not rewrite
  // it — which means the error must not tell the operator to run `mops install`,
  // or CI loops forever on advice that cannot work.
  test("fails on a locked file hash that disagrees with the registry, with a hint that recovers", async () => {
    cleanup();
    try {
      await install();
      const lock = readLock();
      const fileId = Object.keys(lock.hashes["core@1.0.0"])[0] as string;
      lock.hashes["core@1.0.0"][fileId] = "b".repeat(64);
      writeLock(lock);

      const result = await cli(["install", "--locked"], {
        cwd,
        env: { CI: undefined },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/mops\.lock does not match the registry/);
      expect(result.stderr).toMatch(new RegExp(`${fileId}: locked b{64}`));
      // The hint must be the one that works, not "run `mops install`".
      expect(result.stderr).toMatch(
        /delete it and run `mops install` to regenerate it/,
      );
      expect(result.stderr).not.toMatch(
        /Run `mops install` \(without --locked\)/,
      );

      // Documented behavior: plain install does not repair a bad hash value.
      const plain = await cli(["install"], { cwd, env: { CI: undefined } });
      expect(plain.exitCode).toBe(0);
      expect(readFileSync(lockFile, "utf8")).toContain("b".repeat(64));

      // The documented recovery does work.
      rmSync(lockFile, { force: true });
      const recovered = await cli(["install"], { cwd, env: { CI: undefined } });
      expect(recovered.exitCode).toBe(0);
      expect(readFileSync(lockFile, "utf8")).not.toContain("b".repeat(64));
      expect(
        (await cli(["install", "--locked"], { cwd, env: { CI: undefined } }))
          .exitCode,
      ).toBe(0);
    } finally {
      cleanup();
    }
  });

  // Structural disagreement between `deps` and `hashes` is detectable offline,
  // so it self-heals for free — unlike a bad hash value, which would need a
  // ~1.2s registry update call on every install to notice.
  test("self-heals a lock whose hashes and deps disagree", async () => {
    cleanup();
    try {
      await install();
      const lock = readLock();
      lock.hashes["ghost@9.9.9"] = { "ghost@9.9.9/x.mo": "a".repeat(64) };
      writeLock(lock);

      const locked = await cli(["install", "--locked"], {
        cwd,
        env: { CI: undefined },
      });
      expect(locked.exitCode).toBe(1);
      expect(locked.stderr).toMatch(/mops\.lock is internally inconsistent/);
      expect(locked.stderr).toMatch(
        /package ghost@9\.9\.9 has file hashes but is not a locked dependency/,
      );

      const plain = await cli(["install"], { cwd, env: { CI: undefined } });
      expect(plain.exitCode).toBe(0);
      expect(readLock().hashes["ghost@9.9.9"]).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  // A lock can be valid JSON and still be unusable (wrong shape). Every reader
  // indexes into `deps` / `hashes`, so these used to crash with a raw Node
  // stack trace instead of self-healing.
  test.each([
    ["deps missing", (lock: any) => delete lock.deps],
    ["deps not an object", (lock: any) => (lock.deps = [])],
    ["deps value not a string", (lock: any) => (lock.deps = { x: 123 })],
    ["deps value empty", (lock: any) => (lock.deps = { x: "" })],
    ["hashes missing", (lock: any) => delete lock.hashes],
    ["hashes value not an object", (lock: any) => (lock.hashes = { p: "no" })],
  ])("self-heals a parseable v3 lock with %s", async (_label, mutate) => {
    cleanup();
    try {
      await install();
      const lock = readLock();
      mutate(lock);
      writeLock(lock);

      // --locked reports it cleanly rather than crashing.
      const locked = await cli(["install", "--locked"], {
        cwd,
        env: { CI: undefined },
      });
      expect(locked.exitCode).toBe(1);
      expect(locked.stderr).toMatch(/mops\.lock could not be parsed/);
      expect(locked.stderr).not.toMatch(/TypeError|at Object\./);

      // Plain install regenerates it.
      const plain = await cli(["install"], { cwd, env: { CI: undefined } });
      expect(plain.exitCode).toBe(0);
      expect(plain.stderr).not.toMatch(/TypeError/);
      expect(readLock().version).toBe(3);
      expect(Object.keys(readLock().deps).length).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });

  // Verification moved to download time, so install no longer re-hashes
  // `.mops/`. This is the guarantee change in this release: install is not a
  // tamper gate any more — `mops verify` is.
  test("tolerates a locally edited .mops/ file that mops verify rejects", async () => {
    cleanup();
    try {
      await install();
      const localDep = path.join(cwd, ".mops", "core@1.0.0", "mops.toml");
      writeFileSync(localDep, readFileSync(localDep, "utf8") + "\n# edited\n");

      const plain = await cli(["install"], { cwd, env: { CI: undefined } });
      expect(plain.exitCode).toBe(0);

      const locked = await cli(["install", "--locked"], {
        cwd,
        env: { CI: undefined },
      });
      expect(locked.exitCode).toBe(0);

      const verify = await cli(["verify"], { cwd, env: { CI: undefined } });
      expect(verify.exitCode).toBe(1);
      expect(verify.stderr).toMatch(
        /\.mops\/core@1\.0\.0\/mops\.toml does not match mops\.lock/,
      );
      expect(verify.stderr).toMatch(
        /Delete the `\.mops\/core@1\.0\.0` directory and run `mops install`/,
      );
    } finally {
      cleanup();
    }
  });
});

describe("mops verify", () => {
  jest.setTimeout(180_000);

  const cwd = path.join(import.meta.dirname, "install/verify");
  const lockFile = path.join(cwd, "mops.lock");

  const cleanup = () => {
    rmSync(lockFile, { force: true });
    rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
  };

  test("passes on a freshly installed project", async () => {
    cleanup();
    try {
      expect(
        (await cli(["install"], { cwd, env: { CI: undefined } })).exitCode,
      ).toBe(0);
      const result = await cli(["verify"], { cwd, env: { CI: undefined } });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(
        /Integrity verified \d+ package\(s\), \d+ file\(s\)/,
      );
    } finally {
      cleanup();
    }
  });

  test("reports a missing lock", async () => {
    cleanup();
    try {
      const result = await cli(["verify"], { cwd, env: { CI: undefined } });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/mops\.lock is missing/);
    } finally {
      cleanup();
    }
  });

  test("reports files that are not installed", async () => {
    cleanup();
    try {
      expect(
        (await cli(["install"], { cwd, env: { CI: undefined } })).exitCode,
      ).toBe(0);
      rmSync(path.join(cwd, ".mops", "core@1.0.0"), {
        recursive: true,
        force: true,
      });
      const result = await cli(["verify"], { cwd, env: { CI: undefined } });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(
        /locked file\(s\) are missing from \.mops\//,
      );
      expect(result.stderr).toMatch(/Run `mops install` first/);
    } finally {
      cleanup();
    }
  });
});
