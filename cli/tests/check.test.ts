import { beforeEach, describe, expect, test } from "@jest/globals";
import { cpSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import path from "path";
import { cli, cliSnapshot } from "./helpers";

describe("check", () => {
  test("ok", async () => {
    const cwd = path.join(import.meta.dirname, "check/success");
    await cliSnapshot(["check", "Ok.mo"], { cwd }, 0);
    await cliSnapshot(["check", "Ok.mo", "--verbose"], { cwd }, 0);
  });

  test("error", async () => {
    const cwd = path.join(import.meta.dirname, "check/error");
    await cliSnapshot(["check", "Error.mo"], { cwd }, 1);
    await cliSnapshot(["check", "Ok.mo", "Error.mo"], { cwd }, 1);
  });

  test("warning", async () => {
    const cwd = path.join(import.meta.dirname, "check/fix");
    await cliSnapshot(["check", "M0223.mo"], { cwd }, 0);
  });

  test("warning verbose", async () => {
    const cwd = path.join(import.meta.dirname, "check/success");
    const result = await cliSnapshot(
      ["check", "Warning.mo", "--verbose"],
      { cwd },
      0,
    );
    expect(result.stderr).toMatch(/warning \[M0194\]/);
    expect(result.stderr).toMatch(/unused identifier/);
  });

  test("warning with -Werror flag", async () => {
    const cwd = path.join(import.meta.dirname, "check/success");
    await cliSnapshot(["check", "Warning.mo", "--", "-Werror"], { cwd }, 1);
  });

  describe("--fix", () => {
    const fixDir = path.join(import.meta.dirname, "check/fix");
    const runDir = path.join(fixDir, "run");

    beforeEach(() => {
      for (const file of readdirSync(runDir).filter((f) => f.endsWith(".mo"))) {
        unlinkSync(path.join(runDir, file));
      }
    });

    async function checkFix(
      errorCode: string,
      original: string,
      expected: string,
    ) {
      const file = `${errorCode}.mo`;
      cpSync(path.join(fixDir, file), path.join(runDir, file));
      const before = readFileSync(path.join(runDir, file), "utf-8");
      expect(before).toContain(original);
      const result = await cli(["check", `run/${file}`, "--fix"], {
        cwd: fixDir,
      });
      expect(result.exitCode).toBe(0);
      const after = readFileSync(path.join(runDir, file), "utf-8");
      expect(after).toContain(expected);
      expect(after).not.toContain(original);
    }

    test("M0223", async () => {
      await checkFix("M0223", "List.empty<Nat>()", "List.empty()");
    });

    test("M0236", async () => {
      await checkFix("M0236", "List.sortInPlace(list)", "list.sortInPlace()");
    });

    test("M0237", async () => {
      await checkFix(
        "M0237",
        "list.sortInPlace(Nat.compare)",
        "list.sortInPlace()",
      );
    });

    test("verbose", async () => {
      const result = await cli(["check", "Ok.mo", "--fix", "--verbose"], {
        cwd: fixDir,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeTruthy();
    });
  });
});
