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
    test("extra rules on glob-matched files", async () => {
      // src/restricted/*.mo has violations, Ok.mo does not.
      // Extra rules apply only to the glob match → fails on restricted/ files.
      // Filter "Ok" narrows scope so extra is skipped → passes.
      const cwd = path.join(import.meta.dirname, "lint-extra");
      await cliSnapshot(["lint", "--verbose"], { cwd }, 1);
      await cliSnapshot(["lint", "Ok"], { cwd }, 0);
    });

    test("edge cases: pass, empty value, no-match, missing dir", async () => {
      // Single fixture with 4 entries processed in order:
      //   1. Clean.mo + valid rules → passes
      //   2. empty array → warns and skips
      //   3. non-matching glob → skips (verbose warns)
      //   4. missing rule dir → errors
      const cwd = path.join(import.meta.dirname, "lint-extra-edge-cases");
      await cliSnapshot(["lint", "--verbose"], { cwd }, 1);
    });

    test("base rules still run alongside extra rules", async () => {
      const cwd = path.join(import.meta.dirname, "lint-extra-with-base");
      await cliSnapshot(["lint", "--verbose"], { cwd }, 1);
    });

    test("--rules CLI flag does not affect extra runs, multi-rules", async () => {
      // --rules overrides base with an empty dir (no base violations).
      // Extra runs independently with two rule dirs → Restricted.mo fails.
      const cwd = path.join(import.meta.dirname, "lint-extra-with-cli-rules");
      await cliSnapshot(
        ["lint", "--rules", "empty-rules", "--verbose"],
        { cwd },
        1,
      );
    });
  });
});
