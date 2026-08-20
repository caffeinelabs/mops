import { describe, expect, jest, test } from "@jest/globals";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { cli, cliSnapshot } from "./helpers";

// `mops sources` writes the resolved packages to stdout for a build tool to consume, so
// conflict reports go to stderr and machine consumers stay clean.
describe("cross-major conflicts", () => {
  jest.setTimeout(120_000);

  const cleanup = (cwd: string) => {
    rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
    rmSync(path.join(cwd, "mops.lock"), { force: true });
  };

  // Root wants test 2.1.2, the local `legacy` package wants test 1.2.0.
  // Max-wins resolves to 2.1.2 and `legacy` silently compiles against a major
  // it never asked for, so this must always be reported.
  test("reports a cross-major diamond and still resolves", async () => {
    const cwd = path.join(import.meta.dirname, "resolve/cross-major");
    cleanup(cwd);
    try {
      const result = await cliSnapshot(["sources"], { cwd }, 0);
      // resolution succeeded, max-wins picked the higher major
      expect(result.stdout).toMatch(/--package test .*test@2\.1\.2\/src/);
      // stdout stays parseable — the report is on stderr only
      expect(result.stdout).not.toMatch(/Conflicting/);
    } finally {
      cleanup(cwd);
    }
  });

  // Reported by default now — `mops sources` used to be the only caller that
  // opted in, and every other command took the silent default.
  test("names both dependents, the winner and the remedy", async () => {
    const cwd = path.join(import.meta.dirname, "resolve/cross-major");
    cleanup(cwd);
    try {
      const result = await cli(["sources"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toMatch(
        /Conflicting major versions of dependency "test"/,
      );
      expect(result.stderr).toMatch(/test 1\.2\.0 is a dependency of legacy/);
      expect(result.stderr).toMatch(/test 2\.1\.2 is a dependency of/);
      expect(result.stderr).toMatch(/Resolved to test 2\.1\.2/);
      expect(result.stderr).toMatch(/pin it in your root mops\.toml/);
      // one report, not one per resolution pass
      expect(result.stderr.match(/Conflicting major versions/g)).toHaveLength(
        1,
      );
    } finally {
      cleanup(cwd);
    }
  });

  // `mops sources` runs on every `dfx build`, so a conflict the project has
  // reviewed and accepted needs an explicit way to go quiet.
  test("--conflicts ignore suppresses the report", async () => {
    const cwd = path.join(import.meta.dirname, "resolve/cross-major");
    cleanup(cwd);
    try {
      const result = await cli(["sources", "--conflicts", "ignore"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toMatch(/Conflicting/);
      // resolution is unaffected by silencing the report
      expect(result.stdout).toMatch(/--package test .*test@2\.1\.2\/src/);
    } finally {
      cleanup(cwd);
    }
  });

  // The root can win a cross-major conflict with a local path or a git repo,
  // in which case there is no version to name — but the user still needs to be
  // told what won and what to do about it.
  test("reports the winner when the root overrides with a path dep", async () => {
    const cwd = path.join(import.meta.dirname, "resolve/root-path-override");
    cleanup(cwd);
    try {
      const result = await cli(["sources"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toMatch(
        /Conflicting major versions of dependency "test"/,
      );
      expect(result.stderr).toMatch(
        /test 1\.2\.0 is a dependency of a@1\.0\.0/,
      );
      expect(result.stderr).toMatch(
        /test 2\.1\.2 is a dependency of b@1\.0\.0/,
      );
      // the resolution line must still be there, naming the override
      expect(result.stderr).toMatch(
        /Resolved to the root override test = "vendor\/test"/,
      );
      expect(result.stderr).toMatch(/pin it in your root mops\.toml/);
      expect(result.stdout).toMatch(/--package test vendor\/test/);
    } finally {
      cleanup(cwd);
    }
  });

  test("--conflicts error still exits 1", async () => {
    const cwd = path.join(import.meta.dirname, "resolve/cross-major");
    cleanup(cwd);
    try {
      const result = await cli(["sources", "--conflicts", "error"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(
        /Conflicting major versions of dependency "test"/,
      );
      expect(result.stderr).toMatch(/Error! Cross-major dependency conflicts/);
      // one report, not one per resolution pass
      expect(result.stderr.match(/Conflicting major versions/g)).toHaveLength(
        1,
      );
    } finally {
      cleanup(cwd);
    }
  });

  // The walk still visits the loser's manifest, because the lock's `graph`
  // needs it — but what gets installed is the closure of the winners only.
  // `base` is declared solely by test@1.2.0, which loses to test@2.1.2.
  test("does not install a dependency declared only by a losing version", async () => {
    const cwd = path.join(import.meta.dirname, "resolve/cross-major");
    cleanup(cwd);
    try {
      // `mops sources` skips lockfile maintenance, so install to get one
      expect((await cli(["install"], { cwd })).exitCode).toBe(0);
      const result = await cli(["sources"], { cwd });
      expect(result.exitCode).toBe(0);
      // the winner and its own deps are there
      expect(result.stdout).toMatch(/--package test .*test@2\.1\.2\/src/);
      expect(result.stdout).toMatch(/--package core .*core@2\.0\.0\/src/);
      // the loser's exclusive dependency is not handed to moc...
      expect(result.stdout).not.toMatch(/--package base/);
      // ...nor recorded as something this project depends on
      const lock = JSON.parse(
        readFileSync(path.join(cwd, "mops.lock"), "utf8"),
      );
      expect(Object.keys(lock.deps)).not.toContain("base");
      expect(Object.keys(lock.deps)).toContain("test");
      // the loser's edges are still recorded, so regenerating the lock later
      // does not need test@1.2.0 back on disk
      expect(Object.keys(lock.graph ?? {})).toContain("test@1.2.0");
    } finally {
      cleanup(cwd);
    }
  });

  // Same-major skew (2.0.0 vs 2.1.2) is what max-wins is for — no noise.
  test("stays silent on same-major skew", async () => {
    const cwd = path.join(import.meta.dirname, "resolve/same-major");
    cleanup(cwd);
    try {
      const result = await cli(["sources"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/--package test .*test@2\.1\.2\/src/);
      expect(result.stderr).not.toMatch(/Conflicting/);
    } finally {
      cleanup(cwd);
    }
  });
});
