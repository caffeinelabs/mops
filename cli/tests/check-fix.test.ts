import { beforeAll, describe, expect, test } from "@jest/globals";
import { cpSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import path from "path";
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
      unlinkSync(path.join(runDir, file));
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
      M0223: 3,
      M0236: 12,
      M0237: 17,
    });
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

  test("verbose", async () => {
    const result = await cli(["check", "Ok.mo", "--fix", "--verbose"], {
      cwd: fixDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Attempting to fix files");
    expect(result.stdout).toContain("No fixes were needed");
  });
});
