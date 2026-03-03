import { beforeAll, describe, expect, test } from "@jest/globals";
import { cpSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import path from "path";
import { parseDiagnostics } from "../helpers/autofix-motoko";
import { cli } from "./helpers";

function countCodes(stdout: string, codes: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const diag of parseDiagnostics(stdout)) {
    if (codes.includes(diag.code)) {
      counts[diag.code] = (counts[diag.code] ?? 0) + 1;
    }
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

  async function testCheckFix(
    file: string,
    expectedDiagnostics: Record<string, number>,
    verifyContent?: { before: string; after: string },
  ): Promise<string> {
    const runFilePath = path.join(runDir, file);
    cpSync(path.join(fixDir, file), runFilePath);
    const codes = Object.keys(expectedDiagnostics);

    // Verify expected diagnostics before fix
    const beforeResult = await cli(
      ["check", runFilePath, "--", ...diagnosticFlags],
      { cwd: fixDir },
    );
    expect(countCodes(beforeResult.stdout, codes)).toEqual(expectedDiagnostics);

    // Verify content before fix
    if (verifyContent) {
      expect(readFileSync(runFilePath, "utf-8")).toContain(
        verifyContent.before,
      );
    }

    // Apply fix (no --error-format=json — autofixMotoko adds it internally)
    await cli(["check", runFilePath, "--fix", "--", warningFlags], {
      cwd: fixDir,
    });

    // Verify content after fix
    if (verifyContent) {
      const after = readFileSync(runFilePath, "utf-8");
      expect(after).toContain(verifyContent.after);
      expect(after).not.toContain(verifyContent.before);
    }

    // Verify no target diagnostics remain after fix
    const afterResult = await cli(
      ["check", runFilePath, "--", ...diagnosticFlags],
      { cwd: fixDir },
    );
    expect(countCodes(afterResult.stdout, codes)).toEqual({});

    return runFilePath;
  }

  test("M0223", async () => {
    await testCheckFix(
      "M0223.mo",
      { M0223: 1 },
      { before: "identity<Nat>(1)", after: "identity(1)" },
    );
  });

  test("M0236", async () => {
    await testCheckFix(
      "M0236.mo",
      { M0236: 1 },
      { before: "List.sortInPlace(list)", after: "list.sortInPlace()" },
    );
  });

  test("M0237", async () => {
    await testCheckFix(
      "M0237.mo",
      { M0237: 1 },
      { before: "list.sortInPlace(Nat.compare)", after: "list.sortInPlace()" },
    );
  });

  test("edit-suggestions", async () => {
    const runFilePath = await testCheckFix("edit-suggestions.mo", {
      M0223: 2,
      M0236: 12,
      M0237: 17,
    });
    expect(readFileSync(runFilePath, "utf-8")).toMatchSnapshot();
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
