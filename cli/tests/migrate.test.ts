import { describe, expect, test, afterEach } from "@jest/globals";
import { readdirSync, readFileSync } from "node:fs";
import { cp, rm, writeFile } from "node:fs/promises";
import path from "path";
import { cli, cliSnapshot, normalizePaths } from "./helpers";

const normalizeTimestamp = (text: string) =>
  text.replace(/\d{8}_\d{6}/g, "<TIMESTAMP>");

const fixturesDir = path.join(import.meta.dirname, "migrate");

describe("migrate", () => {
  const tempDirs: string[] = [];

  async function makeTempFixture(fixture: string): Promise<string> {
    const src = path.join(fixturesDir, fixture);
    const dest = path.join(fixturesDir, `_tmp_${fixture}_${Date.now()}`);
    await cp(src, dest, { recursive: true });
    tempDirs.push(dest);
    return dest;
  }

  async function patchMigrations(cwd: string, extra: string): Promise<void> {
    const tomlPath = path.join(cwd, "mops.toml");
    const toml = readFileSync(tomlPath, "utf-8");
    await writeFile(
      tomlPath,
      toml.replace(
        'next = "next-migration"',
        `next = "next-migration"\n${extra}`,
      ),
    );
  }

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  describe("migrate new", () => {
    test("creates a migration file with timestamp and template", async () => {
      const cwd = await makeTempFixture("basic");
      const result = await cli(["migrate", "new", "AddPhone"], { cwd });
      expect(result.exitCode).toBe(0);

      const nextDir = path.join(cwd, "next-migration");
      const files = readdirSync(nextDir).filter((f) => f.endsWith(".mo"));
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^\d{8}_\d{6}_AddPhone\.mo$/);

      const content = readFileSync(path.join(nextDir, files[0]!), "utf-8");

      expect({
        exitCode: result.exitCode,
        stdout: normalizeTimestamp(normalizePaths(result.stdout)),
        stderr: normalizePaths(result.stderr),
        template: content,
      }).toMatchSnapshot();
    });

    test("errors when next already has a file", async () => {
      const cwd = await makeTempFixture("basic");
      await cli(["migrate", "new", "First"], { cwd });
      const result = await cli(["migrate", "new", "Second"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/next migration already exists/i);
    });

    test("errors on invalid migration name", async () => {
      const cwd = await makeTempFixture("basic");
      for (const name of ["../evil", "has space", "123start", "foo/bar"]) {
        const result = await cli(["migrate", "new", name], { cwd });
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toMatch(/invalid migration name/i);
      }
    });

    test("errors when [migrations] not configured", async () => {
      const cwd = await makeTempFixture("basic");
      const tomlPath = path.join(cwd, "mops.toml");
      const toml = readFileSync(tomlPath, "utf-8");
      await writeFile(
        tomlPath,
        toml.replace(/\[canisters\.backend\.migrations\][\s\S]*$/, ""),
      );
      const result = await cli(["migrate", "new", "Test"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/\[migrations\]/i);
    });
  });

  describe("migrate freeze", () => {
    test("moves the file from next to chain", async () => {
      const cwd = await makeTempFixture("with-next");
      const result = await cli(["migrate", "freeze"], { cwd });
      expect(result.exitCode).toBe(0);

      const nextFiles = readdirSync(path.join(cwd, "next-migration")).filter(
        (f) => f.endsWith(".mo"),
      );
      expect(nextFiles).toHaveLength(0);

      const chainFiles = readdirSync(path.join(cwd, "migrations")).filter((f) =>
        f.endsWith(".mo"),
      );
      expect(chainFiles).toContain("20250401_000000_RenameId.mo");

      expect({
        exitCode: result.exitCode,
        stdout: normalizePaths(result.stdout),
        stderr: normalizePaths(result.stderr),
      }).toMatchSnapshot();
    });

    test("errors when next is empty", async () => {
      const cwd = await makeTempFixture("basic");
      const result = await cli(["migrate", "freeze"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/no next migration/i);
    });

    test("errors when next-migration does not sort last", async () => {
      const cwd = await makeTempFixture("basic");
      await writeFile(
        path.join(cwd, "next-migration", "00000000_000000_Early.mo"),
        "module {\n  public func migration(_ : {}) : {} {\n    {}\n  }\n}\n",
      );
      const result = await cli(["migrate", "freeze"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/must sort after/i);
    });
  });

  describe("check", () => {
    test("check fails without next migration, passes with it", async () => {
      const cwd = await makeTempFixture("with-next");
      const nextFile = readdirSync(path.join(cwd, "next-migration")).find((f) =>
        f.endsWith(".mo"),
      )!;
      const nextPath = path.join(cwd, "next-migration", nextFile);
      const nextContent = readFileSync(nextPath, "utf-8");
      await rm(nextPath);

      await cliSnapshot(["check"], { cwd }, 1);

      await writeFile(nextPath, nextContent);
      await cliSnapshot(["check"], { cwd }, 0);
    });

    test("check with trimming shows reduced chain", async () => {
      const cwd = await makeTempFixture("basic");
      await patchMigrations(cwd, "check-limit = 2");
      await cliSnapshot(["check", "--verbose"], { cwd }, 0);
    });
  });

  describe("build", () => {
    test("build produces .most with full migration chain", async () => {
      const cwd = await makeTempFixture("basic");
      const result = await cli(["build"], { cwd });
      expect(result.exitCode).toBe(0);

      const most = readFileSync(
        path.join(cwd, ".mops", ".build", "backend.most"),
        "utf-8",
      );
      expect(most).toMatchSnapshot();
    });

    test("build with build-limit produces trimmed .most", async () => {
      const cwd = await makeTempFixture("basic");
      await patchMigrations(cwd, "build-limit = 2");
      const result = await cli(["build"], { cwd });
      expect(result.exitCode).toBe(0);

      const most = readFileSync(
        path.join(cwd, ".mops", ".build", "backend.most"),
        "utf-8",
      );
      expect(most).toMatchSnapshot();
    });
  });

  describe("stable check hint", () => {
    test("stable check fails with hint when deployed.most is incompatible", async () => {
      const cwd = await makeTempFixture("basic");
      await writeFile(
        path.join(cwd, "deployed.most"),
        "// Version: 1.0.0\nactor {\n  stable var a : Nat;\n  stable var name : Int\n};\n",
      );
      await cliSnapshot(["check"], { cwd }, 1);
    });
  });

  describe("conflict detection", () => {
    test("errors when both [migrations] and --enhanced-migration in args", async () => {
      const cwd = await makeTempFixture("basic");
      const tomlPath = path.join(cwd, "mops.toml");
      const toml = readFileSync(tomlPath, "utf-8");
      await writeFile(
        tomlPath,
        toml.replace(
          "[canisters.backend.migrations]",
          'args = ["--enhanced-migration=migrations"]\n\n[canisters.backend.migrations]',
        ),
      );
      const result = await cli(["check"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/--enhanced-migration/);
      expect(result.stderr).toMatch(/managed automatically/i);
    });
  });
});
