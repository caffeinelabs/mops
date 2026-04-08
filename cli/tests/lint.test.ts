import { describe, expect, test } from "@jest/globals";
import path from "path";
import { cli, cliSnapshot } from "./helpers";

describe("lint", () => {
  test("ok", async () => {
    const cwd = path.join(import.meta.dirname, "lint");
    await cliSnapshot(["lint", "Ok", "--verbose"], { cwd }, 0);
  });

  test("error", async () => {
    const cwd = path.join(import.meta.dirname, "lint");
    await cliSnapshot(["lint", "--verbose"], { cwd }, 1);
    await cliSnapshot(["lint", "NoBoolSwitch", "--verbose"], { cwd }, 1);
    await cliSnapshot(["lint", "DoesNotExist"], { cwd }, 1);
  });

  test("[lint] rules - additional config rules directory is used", async () => {
    const cwd = path.join(import.meta.dirname, "lint-config-rules");
    const result = await cli(["lint"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/no-bool-switch/);
  });

  test("[lint] extends - picks up rules/ from named dependency", async () => {
    const cwd = path.join(import.meta.dirname, "lint-extends");
    const result = await cli(["lint"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/no-bool-switch/);
  });

  test("[lint] extends true - picks up rules/ from all dependencies", async () => {
    const cwd = path.join(import.meta.dirname, "lint-extends-all");
    const result = await cli(["lint"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/no-bool-switch/);
  });

  test("[lint] extends - dep not in extends list is ignored", async () => {
    // my-pkg has rules/ but extends only lists "other-pkg" (which doesn't exist),
    // so no dep rules are loaded and NoBoolSwitch.mo passes with exit 0.
    const cwd = path.join(import.meta.dirname, "lint-extends-ignored");
    const result = await cli(["lint"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toMatch(/not found in dependencies/);
  });

  describe("[lint.extra]", () => {
    test("extra rules fail on matched file", async () => {
      const cwd = path.join(import.meta.dirname, "lint-extra");
      const result = await cli(["lint"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/no-bool-switch/);
    });

    test("extra rules pass when matched file is clean", async () => {
      const cwd = path.join(import.meta.dirname, "lint-extra-pass");
      const result = await cli(["lint"], { cwd });
      expect(result.exitCode).toBe(0);
    });

    test("glob pattern matches directory contents", async () => {
      const cwd = path.join(import.meta.dirname, "lint-extra-glob");
      const result = await cli(["lint"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/no-bool-switch/);
    });

    test("non-matching glob skips silently (verbose warns)", async () => {
      const cwd = path.join(import.meta.dirname, "lint-extra-no-match");
      const result = await cli(["lint"], { cwd });
      expect(result.exitCode).toBe(0);
    });

    test("non-matching glob prints warning with --verbose", async () => {
      const cwd = path.join(import.meta.dirname, "lint-extra-no-match");
      const result = await cli(["lint", "--verbose"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toMatch(/no files matched glob/i);
    });

    test("missing rule directory errors", async () => {
      const cwd = path.join(import.meta.dirname, "lint-extra-missing-dir");
      const result = await cli(["lint"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/rule directory.*not found/i);
    });

    test("multiple rule directories per glob", async () => {
      const cwd = path.join(import.meta.dirname, "lint-extra-multi-rules");
      const result = await cli(["lint"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/no-bool-switch/);
    });

    test("base rules still run alongside extra rules", async () => {
      // BadBase.mo has a no-bool-switch violation caught by the base lints/ directory.
      // Restricted.mo (targeted by extra rules) is clean.
      // This proves the failure comes from the base run, not the extra run.
      const cwd = path.join(import.meta.dirname, "lint-extra-with-base");
      const result = await cli(["lint"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/BadBase/);
      expect(result.stderr).toMatch(/no-bool-switch/);
    });

    test("--rules CLI flag does not affect extra runs", async () => {
      // --rules overrides the base rule dirs with an empty dir (no base violations).
      // Extra rules still apply independently → Restricted.mo fails.
      const cwd = path.join(import.meta.dirname, "lint-extra-with-cli-rules");
      const result = await cli(["lint", "--rules", "empty-rules"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/no-bool-switch/);
    });

    test("filter scopes extra runs to matching files", async () => {
      // "Ok" filter means only Ok.mo is linted. Restricted.mo (matched by extra
      // glob) is excluded because the filter narrows the scope.
      const cwd = path.join(import.meta.dirname, "lint-extra");
      const result = await cli(["lint", "Ok"], { cwd });
      expect(result.exitCode).toBe(0);
    });

    test("extra rules do not apply to unmatched files", async () => {
      // Only src/Restricted.mo is matched by the extra glob.
      // Ok.mo should not be checked by the extra rule.
      // Since Ok.mo has no violations even with extra rules, and Restricted.mo does,
      // we verify that the error mentions the restricted file specifically.
      const cwd = path.join(import.meta.dirname, "lint-extra");
      const result = await cli(["lint", "--verbose"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/Restricted/);
    });
  });
});
