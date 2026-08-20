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

  test("no args checks all canisters", async () => {
    const cwd = path.join(import.meta.dirname, "check/canisters");
    await cliSnapshot(["check"], { cwd }, 0);
  });

  test("canister name filters to specific canister", async () => {
    const cwd = path.join(import.meta.dirname, "check/canisters");
    const result = await cli(["check", "backend"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/✓ backend/);
  });

  test("canister resolved relative to config root when run from subdirectory", async () => {
    const fixtureRoot = path.join(
      import.meta.dirname,
      "check/canisters-subdir",
    );
    const subdir = path.join(fixtureRoot, "src/backend");
    const result = await cli(["check"], { cwd: subdir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/✓/);
  });

  test("[moc] args applied to canister check", async () => {
    const cwd = path.join(import.meta.dirname, "check/canisters-moc-args");
    const result = await cli(["check"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/warning \[M0194\]/);
  });

  test("[canisters.X].args applied to canister check", async () => {
    const cwd = path.join(import.meta.dirname, "check/canisters-canister-args");
    const result = await cli(["check"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/warning \[M0194\]/);
  });

  test("canister with errors", async () => {
    const cwd = path.join(import.meta.dirname, "check/canisters-error");
    const result = await cli(["check"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/error/i);
  });

  test("invalid canister name errors", async () => {
    const cwd = path.join(import.meta.dirname, "check/canisters");
    const result = await cli(["check", "nonexistent"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/not found in mops\.toml/);
  });

  test("--fix with canister", async () => {
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

  // Fixture pinned to moc 1.12.0: folding needs --enhanced-migration, so a
  // non-EM canister keeps the classic path even on a moc that supports it.
  // (`--stable-baseline` is disabled outright for now, so this also holds for EM.)
  test("deployed: non-EM canister does not fold into --stable-baseline", async () => {
    const cwd = path.join(import.meta.dirname, "check/deployed-compatible");
    const result = await cli(["check", "--verbose"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toMatch(/--stable-baseline/);
    expect(result.stdout).toMatch(/--stable-compatible/);
    expect(result.stdout).toMatch(/Stable compatibility check passed/);
  });

  test("deployed: skips when file missing and skipIfMissing, with deprecation warning", async () => {
    const cwd = path.join(import.meta.dirname, "check/deployed-missing-skip");
    const result = await cli(["check"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toMatch(/stable/i);
    expect(result.stderr).toMatch(/skipIfMissing.*deprecated/);
  });

  test("deployed: errors when file missing", async () => {
    const cwd = path.join(import.meta.dirname, "check/deployed-missing-error");
    const result = await cli(["check"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/Deployed file not found/);
    expect(result.stderr).toMatch(/empty actor/);
  });

  // Regression: deciding whether to fold used to resolve the baseline eagerly,
  // so a missing baseline masked the compile error that moc reports first.
  test("deployed: compile error wins over a missing .most baseline", async () => {
    const cwd = path.join(
      import.meta.dirname,
      "check/deployed-missing-baseline-compile-error",
    );
    const result = await cli(["check"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/thisshouldnotcompile/);
    expect(result.stderr).not.toMatch(/Deployed file not found/);
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

  // A bad baseline format is a mops.toml error, so it fires before moc runs —
  // unlike a *missing* baseline, which waits so a compile error wins.
  test("rejects a .mo baseline before type-checking", async () => {
    const cwd = path.join(import.meta.dirname, "check-stable/mo-baseline");
    const result = await cli(["check"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(
      /\[canisters\.backend\.check-stable\]\.path must be a \.most file, got: deployed\.mo/,
    );
    expect(result.stdout).not.toMatch(/✓ backend/);
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

  test("--no-lint skips lint even when lintoko is configured", async () => {
    const cwd = path.join(import.meta.dirname, "check/with-lint-pass");
    const result = await cli(["check", "--no-lint"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toMatch(/Lint/);
  });

  test("unknown flag before -- is rejected", async () => {
    const cwd = path.join(import.meta.dirname, "check/success");
    const result = await cli(["check", "--nope"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/unknown option '--nope'/);
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

  // The migrations-chain fixture has 4 migrations with check-limit=3, so the
  // oldest is trimmed by default (staged dir + M0254 suppression). --no-check-limit
  // must point moc at the real chain dir and drop the trimming side effects.
  const migrationsChain = "check-stable/migrations-chain";

  test("check-limit trims the migration chain by default", async () => {
    const cwd = path.join(import.meta.dirname, migrationsChain);
    const result = await cli(["check", "--verbose"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/--enhanced-migration=[^"]*\.migrations-/);
    expect(result.stdout).toMatch(/-A=M0254/);
  });

  test("--no-check-limit uses the full migration chain", async () => {
    const cwd = path.join(import.meta.dirname, migrationsChain);
    const result = await cli(["check", "--verbose", "--no-check-limit"], {
      cwd,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/--enhanced-migration=/);
    expect(result.stdout).not.toMatch(/\.migrations-/);
    expect(result.stdout).not.toMatch(/-A=M0254/);
  });

  test("--no-check-limit suppresses pending migration warning in check", async () => {
    const cwd = path.join(
      import.meta.dirname,
      "check-stable/check-limit-warning",
    );
    const result = await cli(["check", "--no-check-limit"], { cwd });
    expect(result.stderr).not.toMatch(/pending migration\(s\) but check-limit/);
  });
});
