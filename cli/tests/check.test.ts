import { describe, expect, test } from "@jest/globals";
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
    const cwd = path.join(import.meta.dirname, "check/success");
    const result = await cliSnapshot(["check", "Warning.mo"], { cwd }, 0);
    expect(result.stderr).toMatch(/warning \[M0194\]/);
    expect(result.stderr).toMatch(/unused identifier/);
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
    const result = await cliSnapshot(
      ["check", "Warning.mo", "--", "-Werror"],
      { cwd },
      1,
    );
    expect(result.stderr).toMatch(/warning \[M0194\]/);
    expect(result.stderr).toMatch(/unused identifier/);
  });

  test("[moc] args are passed to moc", async () => {
    const cwd = path.join(import.meta.dirname, "check/moc-args");
    await cliSnapshot(["check", "Warning.mo"], { cwd }, 1);
  });

  test("no args falls back to [canisters] entrypoints", async () => {
    const cwd = path.join(import.meta.dirname, "check/canisters");
    await cliSnapshot(["check"], { cwd }, 0);
  });

  test("[moc] args applied when using canister fallback", async () => {
    const cwd = path.join(import.meta.dirname, "check/canisters-moc-args");
    const result = await cli(["check"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/warning \[M0194\]/);
  });

  test("canister entrypoint with errors", async () => {
    const cwd = path.join(import.meta.dirname, "check/canisters-error");
    const result = await cli(["check"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/error/i);
  });

  test("--fix with canister fallback", async () => {
    const cwd = path.join(import.meta.dirname, "check/canisters");
    const result = await cli(["check", "--fix"], { cwd });
    expect(result.exitCode).toBe(0);
  });
});
