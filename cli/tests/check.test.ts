import { describe, expect, test } from "@jest/globals";
import path from "path";
import { cliSnapshot } from "./helpers";

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
    const cwd = path.join(import.meta.dirname, "check/success");
    await cliSnapshot(["check", "Warning.mo"], { cwd }, 0);
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
});
