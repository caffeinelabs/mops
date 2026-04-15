import { describe, expect, test, afterEach } from "@jest/globals";
import { readdirSync, readFileSync } from "node:fs";
import { cp, rm, writeFile } from "node:fs/promises";
import path from "path";
import { cli } from "./helpers";

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

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  describe("migrate new", () => {
    test("creates a migration file with timestamp and template", async () => {
      const cwd = await makeTempFixture("basic");
      const result = await cli(["migrate", "new", "AddEmail"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/Created migration/);

      const nextDir = path.join(cwd, "next-migration");
      const files = readdirSync(nextDir).filter((f) => f.endsWith(".mo"));
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^\d{8}_\d{6}_AddEmail\.mo$/);

      const content = readFileSync(path.join(nextDir, files[0]!), "utf-8");
      expect(content).toContain("public func migration");
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
      await writeFile(
        path.join(cwd, "mops.toml"),
        '[toolchain]\nmoc = "1.5.0"\n\n[canisters.backend]\nmain = "src/main.mo"\n',
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
      expect(result.stdout).toMatch(/Frozen migration/);

      const nextFiles = readdirSync(path.join(cwd, "next-migration")).filter(
        (f) => f.endsWith(".mo"),
      );
      expect(nextFiles).toHaveLength(0);

      const chainFiles = readdirSync(path.join(cwd, "migrations")).filter((f) =>
        f.endsWith(".mo"),
      );
      expect(chainFiles).toContain("20250201_000000_AddField.mo");
    });

    test("errors when next is empty", async () => {
      const cwd = await makeTempFixture("basic");
      const result = await cli(["migrate", "freeze"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/no next migration/i);
    });
  });

  describe("check with [migrations]", () => {
    test("check passes with migrations config and no next migration", async () => {
      const cwd = path.join(fixturesDir, "basic");
      const result = await cli(["check"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/✓ backend/);
    });

    test("check passes with next migration included", async () => {
      const cwd = path.join(fixturesDir, "with-next");
      const result = await cli(["check"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/✓ backend/);
    });
  });

  describe("chain trimming", () => {
    test("check passes with check-limit trimming the chain", async () => {
      const cwd = path.join(fixturesDir, "trimmed");
      const result = await cli(["check", "--verbose"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/✓ backend/);
      expect(result.stdout).toMatch(/trimmed from 2/);
    });
  });

  describe("ordering validation", () => {
    test("freeze errors when next-migration does not sort last", async () => {
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

  describe("conflict detection", () => {
    test("errors when both [migrations] and --enhanced-migration in args", async () => {
      const cwd = await makeTempFixture("basic");
      await writeFile(
        path.join(cwd, "mops.toml"),
        `[toolchain]
moc = "1.5.0"

[moc]
args = ["--default-persistent-actors"]

[canisters.backend]
main = "src/main.mo"
args = ["--enhanced-migration=migrations"]

[canisters.backend.migrations]
chain = "migrations"
next = "next-migration"
`,
      );
      const result = await cli(["check"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/--enhanced-migration/);
      expect(result.stderr).toMatch(/managed automatically/i);
    });
  });
});
