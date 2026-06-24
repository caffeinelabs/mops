import { beforeAll, describe, expect, test } from "@jest/globals";
import {
  chmodSync,
  cpSync,
  readdirSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "path";
import { lock } from "proper-lockfile";
import { parseDiagnostics } from "../helpers/autofix-motoko";
import { cli, normalizePaths } from "./helpers";

function countCodes(stdout: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const diag of parseDiagnostics(stdout)) {
    counts[diag.code] = (counts[diag.code] ?? 0) + 1;
  }
  return counts;
}

describe("check --fix", () => {
  const fixDir = path.join(import.meta.dirname, "check/fix");
  const runDir = path.join(fixDir, "run");
  const warningFlags = "-W=M0223,M0236,M0237";
  const diagnosticFlags = [warningFlags, "--error-format=json"];

  beforeAll(() => {
    for (const file of readdirSync(runDir).filter((f) => f.endsWith(".mo"))) {
      const p = path.join(runDir, file);
      chmodSync(p, 0o644);
      unlinkSync(p);
    }
  });

  function copyFixture(file: string): string {
    const dest = path.join(runDir, file);
    cpSync(path.join(fixDir, file), dest);
    return dest;
  }

  async function testCheckFix(
    file: string,
    expectedDiagnostics: Record<string, number>,
    expectedAfterDiagnostics: Record<string, number> = {},
  ): Promise<string> {
    const runFilePath = copyFixture(file);

    const beforeResult = await cli(
      ["check", runFilePath, "--", ...diagnosticFlags],
      { cwd: fixDir },
    );
    expect(countCodes(beforeResult.stdout)).toEqual(expectedDiagnostics);

    const fixResult = await cli(
      ["check", runFilePath, "--fix", "--", warningFlags],
      { cwd: fixDir },
    );

    expect(normalizePaths(fixResult.stdout)).toMatchSnapshot("fix output");
    expect(readFileSync(runFilePath, "utf-8")).toMatchSnapshot();

    const afterResult = await cli(
      ["check", runFilePath, "--", ...diagnosticFlags],
      { cwd: fixDir },
    );
    expect(countCodes(afterResult.stdout)).toEqual(expectedAfterDiagnostics);

    return runFilePath;
  }

  test("parseDiagnostics tolerates missing moc output", () => {
    // execa with reject:false yields undefined stdout when moc fails to spawn
    // or is killed (e.g. OOM); parsing must degrade to no diagnostics, not throw.
    expect(parseDiagnostics(undefined)).toEqual([]);
    expect(parseDiagnostics("")).toEqual([]);
  });

  test("M0223", async () => {
    await testCheckFix("M0223.mo", { M0223: 1 });
  });

  test("M0236", async () => {
    await testCheckFix("M0236.mo", { M0236: 1 });
  });

  test("M0237", async () => {
    await testCheckFix("M0237.mo", { M0237: 1 });
  });

  test("edit-suggestions", async () => {
    await testCheckFix("edit-suggestions.mo", {
      M0223: 2,
      M0236: 11,
      M0237: 17,
    });
  });

  test("overlapping edits", async () => {
    await testCheckFix("overlapping.mo", { M0223: 1, M0236: 2 });
  });

  test("transitive imports", async () => {
    const runMainPath = copyFixture("transitive-main.mo");
    const runLibPath = copyFixture("transitive-lib.mo");

    const fixResult = await cli(
      ["check", runMainPath, "--fix", "--", warningFlags],
      { cwd: fixDir },
    );

    expect(normalizePaths(fixResult.stdout)).toMatchSnapshot("fix output");
    expect(readFileSync(runMainPath, "utf-8")).toMatchSnapshot("main file");
    expect(readFileSync(runLibPath, "utf-8")).toMatchSnapshot("lib file");

    const afterResult = await cli(
      ["check", runMainPath, "--", ...diagnosticFlags],
      { cwd: fixDir },
    );
    expect(countCodes(afterResult.stdout)).toEqual({});
  });

  test("--error-format=human does not break --fix", async () => {
    const runFilePath = copyFixture("M0223.mo");

    const fixResult = await cli(
      [
        "check",
        runFilePath,
        "--fix",
        "--",
        warningFlags,
        "--error-format=human",
      ],
      { cwd: fixDir },
    );

    expect(fixResult.stdout).toContain("1 fix applied");
    expect(readFileSync(runFilePath, "utf-8")).not.toContain("<Nat>");
  });

  test("read-only file is skipped, not crashed", async () => {
    const runFilePath = copyFixture("M0223.mo");
    const before = readFileSync(runFilePath, "utf-8");
    chmodSync(runFilePath, 0o444);

    const result = await cli(
      ["check", runFilePath, "--fix", "--", warningFlags],
      { cwd: fixDir },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toMatch(/Skipped read-only file/);
    // File left untouched since the fix couldn't be written.
    expect(readFileSync(runFilePath, "utf-8")).toBe(before);
  });

  test("verbose", async () => {
    const result = await cli(["check", "Ok.mo", "--fix", "--verbose"], {
      cwd: fixDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Attempting to fix files");
    expect(result.stdout).toContain("No fixes were needed");
  });

  test("fix with remaining warnings", async () => {
    const runFilePath = copyFixture("fix-with-warning.mo");
    const result = await cli(
      ["check", runFilePath, "--fix", "--", warningFlags],
      { cwd: fixDir },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("1 fix applied");
    expect(result.stdout).toMatch(/✓/);
    expect(result.stderr).toMatch(/warning \[M0194\]/);
    expect(result.stderr).toMatch(/unused identifier/);
  });

  test("fix with remaining errors", async () => {
    const runFilePath = copyFixture("fix-with-error.mo");
    const result = await cli(
      ["check", runFilePath, "--fix", "--", warningFlags],
      { cwd: fixDir },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("1 fix applied");
    expect(result.stderr).toMatch(/error/i);
    expect(result.stdout).not.toMatch(/✓ run/);
  });

  test("concurrent --fix runs serialize and produce the same output", async () => {
    const runFilePath = copyFixture("edit-suggestions.mo");
    await cli(["check", runFilePath, "--fix", "--", warningFlags], {
      cwd: fixDir,
    });
    const expected = readFileSync(runFilePath, "utf-8");
    copyFixture("edit-suggestions.mo");

    // Hold the lock from the test process itself so both children
    // deterministically hit ELOCKED, print "Waiting...", and queue.
    const lockTarget = path.join(fixDir, ".mops", "fix.lock");
    await mkdir(path.dirname(lockTarget), { recursive: true });
    await writeFile(lockTarget, "", { flag: "a" });
    const release = await lock(lockTarget, { stale: 30_000 });

    const childA = cli(["check", runFilePath, "--fix", "--", warningFlags], {
      cwd: fixDir,
    });
    const childB = cli(["check", runFilePath, "--fix", "--", warningFlags], {
      cwd: fixDir,
    });

    // Hold long enough for both children to spawn (`npm run mops` → bundler →
    // CLI startup) and attempt the non-blocking acquire. 5s is conservative —
    // local runs land well under 2s, the headroom is purely to absorb CI jitter.
    await new Promise((r) => setTimeout(r, 5000));
    await release();

    const [a, b] = await Promise.all([childA, childB]);
    expect(a.exitCode).toBe(0);
    expect(b.exitCode).toBe(0);
    expect(readFileSync(runFilePath, "utf-8")).toBe(expected);
    // At least one child must have hit the held lock and queued; if neither
    // did, the lock didn't actually serialize anything.
    expect(a.stdout + b.stdout).toContain("Waiting for another");
  });
});
