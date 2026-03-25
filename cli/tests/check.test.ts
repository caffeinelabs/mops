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

  test("canister entrypoint resolved relative to config root when run from subdirectory", async () => {
    const fixtureRoot = path.join(
      import.meta.dirname,
      "check/canisters-subdir",
    );
    const subdir = path.join(fixtureRoot, "src/backend");
    const result = await cli(["check"], { cwd: subdir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/✓/);
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

  test("deployed: runs stable check when deployed file exists", async () => {
    const cwd = path.join(import.meta.dirname, "check/deployed-compatible");
    const result = await cli(["check"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Stable compatibility check passed/);
  });

  test("deployed: silently skips when file missing and skipIfMissing", async () => {
    const cwd = path.join(import.meta.dirname, "check/deployed-missing-skip");
    const result = await cli(["check"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toMatch(/stable/i);
  });

  test("deployed: errors when file missing without deployedSkipIfFileMissing", async () => {
    const cwd = path.join(import.meta.dirname, "check/deployed-missing-error");
    const result = await cli(["check"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/Deployed file not found/);
    expect(result.stderr).toMatch(/skipIfMissing/);
  });

  test("--fix runs stable check after fixing", async () => {
    const cwd = path.join(import.meta.dirname, "check/deployed-compatible");
    const result = await cli(["check", "--fix"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Stable compatibility check passed/);
  });

  test("stable check is skipped when type-checking fails", async () => {
    const cwd = path.join(import.meta.dirname, "check/deployed-compile-error");
    const result = await cli(["check"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/error/i);
    expect(result.stdout).not.toMatch(/Stable compatibility/);
  });

  test("lint runs after moc check and passes", async () => {
    const cwd = path.join(import.meta.dirname, "check/with-lint-pass");
    const result = await cli(["check"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/✓ Lint succeeded/);
  });

  test("check fails when lint finds errors", async () => {
    const cwd = path.join(import.meta.dirname, "check/with-lint-fail");
    const result = await cli(["check"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/no-bool-switch/);
  });

  test("lint is skipped when lintoko not configured and no rules exist", async () => {
    const cwd = path.join(import.meta.dirname, "check/canisters");
    const result = await cli(["check"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toMatch(/Lint/);
  });

  test("--fix flag reaches lint step", async () => {
    const cwd = path.join(import.meta.dirname, "check/with-lint-pass");
    const result = await cli(["check", "--fix"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/✓ Lint fixes applied/);
  });
});
