import { describe, expect, test } from "@jest/globals";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "path";
import { cli, cliSnapshot, useTempFixtures } from "./helpers";

const packagingArgs = [
  "publish",
  "--dry-run",
  "--no-docs",
  "--no-test",
  "--no-bench",
] as const;

describe("publish --dry-run", () => {
  const fixturesDir = path.join(import.meta.dirname, "publish-dry-run");
  const makeTempFixture = useTempFixtures(fixturesDir);

  test("success", async () => {
    const cwd = path.join(fixturesDir, "success");
    await cliSnapshot([...packagingArgs], { cwd, env: { CI: "1" } }, 0);
  });

  test("rejects local path dependencies", async () => {
    const cwd = await makeTempFixture("success");
    await writeFile(
      path.join(cwd, "mops.toml"),
      `[package]
name = "dry-run-fixture"
version = "0.1.0"
description = "Fixture for mops publish --dry-run"
license = "MIT"

[dependencies]
local-lib = "../local-lib"
`,
    );
    const result = await cli([...packagingArgs], {
      cwd,
      env: { CI: "1" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/local dependencies/i);
  });

  test("rejects missing README.md", async () => {
    const cwd = await makeTempFixture("success");
    await rm(path.join(cwd, "README.md"));
    const result = await cli([...packagingArgs], {
      cwd,
      env: { CI: "1" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/README\.md/);
  });

  test("rejects unsupported file extension", async () => {
    const cwd = await makeTempFixture("success");
    await mkdir(path.join(cwd, "extra"), { recursive: true });
    await writeFile(path.join(cwd, "extra", "data.json"), '{"ok":true}\n');
    await writeFile(
      path.join(cwd, "mops.toml"),
      `[package]
name = "dry-run-fixture"
version = "0.1.0"
description = "Fixture for mops publish --dry-run"
license = "MIT"
files = ["**/*.mo", "extra/data.json"]
`,
    );
    const result = await cli([...packagingArgs], {
      cwd,
      env: { CI: "1" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/unsupported extension/i);
  });

  test("warns on missing description", async () => {
    const cwd = await makeTempFixture("success");
    await writeFile(
      path.join(cwd, "mops.toml"),
      `[package]
name = "dry-run-fixture"
version = "0.1.0"
license = "MIT"
`,
    );
    const result = await cli([...packagingArgs], {
      cwd,
      env: { CI: "1" },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).toMatch(
      /Missing recommended config key "description"/,
    );
  });

  test("rejects GitHub dependencies", async () => {
    const cwd = await makeTempFixture("success");
    await writeFile(
      path.join(cwd, "mops.toml"),
      `[package]
name = "dry-run-fixture"
version = "0.1.0"
description = "Fixture for mops publish --dry-run"
license = "MIT"

[dependencies]
other = "https://github.com/org/repo#main:src"
`,
    );
    const result = await cli([...packagingArgs], {
      cwd,
      env: { CI: "1" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/GitHub dependencies/i);
  });

  test("runs the test step by default", async () => {
    const cwd = path.join(fixturesDir, "success");
    const result = await cli(
      ["publish", "--dry-run", "--no-docs", "--no-bench"],
      { cwd, env: { CI: "1" } },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Running tests/);
    expect(result.stdout).toMatch(/No test files found/);
    expect(result.stdout).toMatch(/Dry-run OK/);
  });
});
