import { describe, expect, test, afterEach } from "@jest/globals";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
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
      await cliSnapshot(["lint"], { cwd }, 1);
      await cliSnapshot(["lint", "Ok"], { cwd }, 0);
    });

    test("edge cases: pass, empty value, no-match, missing dir", async () => {
      // Single fixture with 4 entries processed in order:
      //   1. Clean.mo + valid rules → passes
      //   2. empty array → warns and skips
      //   3. non-matching glob → warns and skips
      //   4. missing rule dir → errors
      const cwd = path.join(import.meta.dirname, "lint-extra-edge-cases");
      await cliSnapshot(["lint"], { cwd }, 1);
    });

    test("base rules still run alongside extra rules", async () => {
      const cwd = path.join(import.meta.dirname, "lint-extra-with-base");
      await cliSnapshot(["lint"], { cwd }, 1);
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

    test("example rules: no-types, types-only, migration-only, migration-self-contained", async () => {
      const cwd = path.join(import.meta.dirname, "lint-extra-example-rules");
      await cliSnapshot(["lint"], { cwd }, 1);
    });
  });

  describe("migration trimming via check-limit", () => {
    const migrateFixturesDir = path.join(import.meta.dirname, "migrate");
    const tempDirs: string[] = [];

    afterEach(async () => {
      for (const dir of tempDirs) {
        await rm(dir, { recursive: true, force: true });
      }
      tempDirs.length = 0;
    });

    async function makeWithNextLintFixture(
      checkLimit?: number,
    ): Promise<string> {
      const dest = path.join(
        migrateFixturesDir,
        `_tmp_lint_with-next_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      );
      await cp(path.join(migrateFixturesDir, "with-next"), dest, {
        recursive: true,
      });
      tempDirs.push(dest);

      // Empty lints/ → collectLintRules picks it up so lintoko runs cleanly
      // (no rules → no violations → exit 0), preventing assertions from
      // passing by coincidence on an unrelated lintoko failure.
      await mkdir(path.join(dest, "lints"), { recursive: true });

      let toml = readFileSync(path.join(dest, "mops.toml"), "utf-8").replace(
        'moc = "1.5.0"',
        'moc = "1.5.0"\nlintoko = "0.7.0"',
      );
      if (checkLimit !== undefined) {
        toml = toml.replace(
          'next = "next-migration"',
          `next = "next-migration"\ncheck-limit = ${checkLimit}`,
        );
      }
      await writeFile(path.join(dest, "mops.toml"), toml);
      return dest;
    }

    test("check-limit=1 trims old chain migrations from lint", async () => {
      // with-next has 3 chain files + 1 next file. check-limit=1 keeps only
      // the next file → 3 chain files trimmed from lint.
      const cwd = await makeWithNextLintFixture(1);
      const result = await cli(["lint", "--verbose"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(
        /Trimmed 3 migration file\(s\) \(check-limit\)/,
      );
      expect(result.stdout).not.toMatch(/20250101_000000_Init\.mo/);
      expect(result.stdout).not.toMatch(/20250201_000000_AddName\.mo/);
      expect(result.stdout).not.toMatch(/20250301_000000_AddEmail\.mo/);
      expect(result.stdout).toMatch(/20250401_000000_RenameId\.mo/);
    });

    test("no check-limit → all migration files are linted", async () => {
      const cwd = await makeWithNextLintFixture();
      const result = await cli(["lint", "--verbose"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toMatch(/Trimmed \d+ migration file/);
      expect(result.stdout).toMatch(/20250101_000000_Init\.mo/);
      expect(result.stdout).toMatch(/20250401_000000_RenameId\.mo/);
    });

    test("explicit filter bypasses trimming so user can target a chain file", async () => {
      const cwd = await makeWithNextLintFixture(1);
      const result = await cli(["lint", "Init", "--verbose"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toMatch(/Trimmed \d+ migration file/);
      expect(result.stdout).toMatch(/20250101_000000_Init\.mo/);
    });

    test("invalid check-limit fails `mops lint` (consistent with `mops check`)", async () => {
      const cwd = await makeWithNextLintFixture(0);
      const result = await cli(["lint"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/check-limit must be a positive integer/);
    });
  });
});
