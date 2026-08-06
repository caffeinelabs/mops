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

  test("fails when a locked file hash disagrees with the registry", async () => {
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
      expect(result.stderr).toMatch(/mops\.lock is out of date, but --locked/);
      expect(result.stderr).toMatch(new RegExp(`${fileId}: locked b{64}`));
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
