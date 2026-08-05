import { describe, expect, jest, test } from "@jest/globals";
import { rmSync } from "node:fs";
import path from "node:path";
import { cli, cliSnapshot } from "./helpers";

// `mops sources` writes the resolved packages to stdout for dfx's packtool, so
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

  // `--conflicts ignore` used to drop the report entirely.
  test("--conflicts ignore no longer suppresses the report", async () => {
    const cwd = path.join(import.meta.dirname, "resolve/cross-major");
    cleanup(cwd);
    try {
      const result = await cli(["sources", "--conflicts", "ignore"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toMatch(
        /Conflicting major versions of dependency "test"/,
      );
      expect(result.stderr).toMatch(/test 1\.2\.0 is a dependency of legacy/);
      expect(result.stderr).toMatch(/test 2\.1\.2 is a dependency of/);
      expect(result.stderr).toMatch(/Resolved to test 2\.1\.2/);
      expect(result.stderr).toMatch(/pin it in your root mops\.toml/);
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
