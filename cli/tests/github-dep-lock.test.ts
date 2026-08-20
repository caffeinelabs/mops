import { afterEach, describe, expect, jest, test } from "@jest/globals";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cli } from "./helpers";

// `repo = "..."` dependencies get no hashes from the registry, so mops.lock is
// the only record of what was installed: a resolved commit plus a digest of the
// extracted tree. These tests download from github.com, like
// install-github-dep.test.ts. Every run gets its own XDG_CACHE_HOME so the
// global cache of one case cannot answer for another (and so a case that
// replaces a cache entry cannot disturb a concurrent test file).
const REPO = "https://github.com/ZenVoich/test";
const COMMIT = "06d7c77accb9fb08830643aa8f0e346295f6b263";
const SHA256 = /^[0-9a-f]{64}$/;

describe("github dependency integrity in mops.lock", () => {
  jest.setTimeout(180_000);

  const scratchDirs: string[] = [];

  afterEach(() => {
    for (const dir of scratchDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    scratchDirs.length = 0;
  });

  const makeProject = (files: Record<string, string>): string => {
    const root = mkdtempSync(
      path.join(import.meta.dirname, "install", "_tmp_github-lock_"),
    );
    scratchDirs.push(root);
    for (const [file, content] of Object.entries(files)) {
      const target = path.join(root, file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    return root;
  };

  const makeCache = (): string => {
    const dir = mkdtempSync(path.join(tmpdir(), "mops-github-lock-cache-"));
    scratchDirs.push(dir);
    return dir;
  };

  const readLock = (cwd: string) =>
    JSON.parse(readFileSync(path.join(cwd, "mops.lock"), "utf8"));

  const writeLock = (cwd: string, lock: unknown) =>
    writeFileSync(path.join(cwd, "mops.lock"), JSON.stringify(lock, null, 2));

  const run = (args: string[], cwd: string, cache: string) =>
    cli(args, { cwd, env: { CI: undefined, XDG_CACHE_HOME: cache } });

  test("records the commit and a content hash, and the lock still validates as v3", async () => {
    const cwd = makeProject({
      "mops.toml": `[dependencies]\ntest = "${REPO}#master@${COMMIT}"\n`,
      "src/lib.mo": "module {}\n",
    });
    const cache = makeCache();

    expect((await run(["install"], cwd, cache)).exitCode).toBe(0);

    const lock = readLock(cwd);
    // No format bump: the field is a sidecar on the same version 3.
    expect(lock.version).toBe(3);
    expect(lock.github.test.resolved).toBe(COMMIT);
    expect(lock.github.test.hash).toMatch(SHA256);
    // `deps` values stay verbatim — appending `@sha` would break `--locked`
    // against a mops.toml that declares the plain ref.
    expect(lock.deps.test).toBe(`${REPO}#master@${COMMIT}`);
    // And the github dep stays out of `hashes`, which older CLIs cross-check
    // against the registry packages in `deps`.
    expect(lock.hashes).toEqual({});

    // The existing v3 validation path accepts what we just wrote.
    const locked = await run(["install", "--locked"], cwd, cache);
    expect(locked.exitCode).toBe(0);

    const verify = await run(["verify"], cwd, cache);
    expect(verify.exitCode).toBe(0);
    expect(verify.stdout).toMatch(/Integrity verified 1 package\(s\)/);
  });

  test("a project with no github dependency writes no github field", async () => {
    const cwd = makeProject({
      "mops.toml": '[dependencies]\nlib = "./lib"\n',
      "lib/mops.toml": '[package]\nname = "lib"\nversion = "1.0.0"\n',
      "lib/src/lib.mo": "module {}\n",
      "src/lib.mo": "module {}\n",
    });
    const cache = makeCache();

    expect((await run(["install"], cwd, cache)).exitCode).toBe(0);
    expect("github" in readLock(cwd)).toBe(false);
    expect((await run(["install", "--locked"], cwd, cache)).exitCode).toBe(0);
  });

  test("a lock written before the field is healed by install and fails --locked", async () => {
    const cwd = makeProject({
      "mops.toml": `[dependencies]\ntest = "${REPO}#master@${COMMIT}"\n`,
      "src/lib.mo": "module {}\n",
    });
    const cache = makeCache();

    expect((await run(["install"], cwd, cache)).exitCode).toBe(0);
    const lock = readLock(cwd);
    delete lock.github;
    writeLock(cwd, lock);

    const locked = await run(["install", "--locked"], cwd, cache);
    expect(locked.exitCode).toBe(1);
    expect(locked.stderr).toMatch(
      /does not record the integrity of a GitHub dependency/,
    );
    expect(locked.stderr).toMatch(
      /dependency test has no recorded commit and content hash/,
    );

    expect((await run(["install"], cwd, cache)).exitCode).toBe(0);
    expect(readLock(cwd).github.test.resolved).toBe(COMMIT);
  });

  test("a download that disagrees with the lock fails and does not reach the cache", async () => {
    const cwd = makeProject({
      "mops.toml": `[dependencies]\ntest = "${REPO}#master@${COMMIT}"\n`,
      "src/lib.mo": "module {}\n",
    });
    const cache = makeCache();

    expect((await run(["install"], cwd, cache)).exitCode).toBe(0);

    const lock = readLock(cwd);
    lock.github.test.hash = "b".repeat(64);
    writeLock(cwd, lock);
    // An empty cache forces the download the check is supposed to reject.
    const emptyCache = makeCache();
    rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });

    const result = await run(["install"], cwd, emptyCache);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/integrity check failed for test/);
    expect(result.stderr).toMatch(/either the download is corrupt or mops/);
    // Named separately because the fix differs: re-pinning vs restoring.
    expect(result.stderr).toMatch(/a moved tag, a force-push/);

    // Nothing was admitted: neither the global cache nor the project copy.
    const cached = path.join(emptyCache, "mops/packages/_github");
    expect(existsSync(cached) ? readdirSync(cached) : []).toEqual([]);
    expect(existsSync(path.join(cwd, ".mops/_github"))).toBe(false);
  });

  test("mops verify rejects an edited github dependency directory", async () => {
    const cwd = makeProject({
      "mops.toml": `[dependencies]\ntest = "${REPO}#master@${COMMIT}"\n`,
      "src/lib.mo": "module {}\n",
    });
    const cache = makeCache();

    expect((await run(["install"], cwd, cache)).exitCode).toBe(0);

    const depToml = path.join(
      cwd,
      ".mops/_github",
      `test#master@${COMMIT}`,
      "mops.toml",
    );
    writeFileSync(depToml, readFileSync(depToml, "utf8") + "\n# edited\n");

    const verify = await run(["verify"], cwd, cache);
    expect(verify.exitCode).toBe(1);
    expect(verify.stderr).toMatch(
      /_github\/test#master@[0-9a-f]{40} does not match mops\.lock/,
    );
  });

  test("a ref with no commit is pinned to one, leaving the dep value alone", async () => {
    const cwd = makeProject({
      "mops.toml": `[dependencies]\ntest = "${REPO}#main"\n`,
      "src/lib.mo": "module {}\n",
    });
    const cache = makeCache();

    const result = await run(["install"], cwd, cache);
    expect(result.exitCode).toBe(0);

    // Pinning a bare ref needs one call to the GitHub API, which is
    // rate-limited to 60/h per IP anonymously. A runner that has spent its
    // budget still installs — it just cannot pin — so don't assert a pin then.
    if (/could not resolve .* to a commit/.test(result.stderr)) {
      return;
    }

    const lock = readLock(cwd);
    expect(lock.deps.test).toBe(`${REPO}#main`);
    expect(lock.github.test.resolved).toMatch(/^[0-9a-f]{40}$/);
    expect(lock.github.test.hash).toMatch(SHA256);

    // Pinned means the second run neither calls the API nor re-fetches.
    const cached = await run(["install", "--verbose"], cwd, cache);
    expect(cached.exitCode).toBe(0);
    expect(cached.stdout + cached.stderr).toMatch(/\(cache\)/);
    expect((await run(["install", "--locked"], cwd, cache)).exitCode).toBe(0);
  });

  test("cache content that drifted under a moving ref is replaced, not trusted", async () => {
    const cwd = makeProject({
      "mops.toml": `[dependencies]\ntest = "${REPO}#main"\n`,
      "src/lib.mo": "module {}\n",
    });
    const cache = makeCache();

    const result = await run(["install"], cwd, cache);
    expect(result.exitCode).toBe(0);
    if (/could not resolve .* to a commit/.test(result.stderr)) {
      return;
    }

    // The cache key for a ref that names no commit is the ref itself, so an
    // entry can hold content from a commit the ref no longer points at.
    const cachedToml = path.join(
      cache,
      "mops/packages/_github/test#main/mops.toml",
    );
    writeFileSync(cachedToml, readFileSync(cachedToml, "utf8") + "# drifted\n");

    expect((await run(["install"], cwd, cache)).exitCode).toBe(0);
    expect(readFileSync(cachedToml, "utf8")).not.toContain("# drifted");
    // The project copy is derived from the cache entry, so it is refreshed too.
    expect((await run(["verify"], cwd, cache)).exitCode).toBe(0);
  });
});
