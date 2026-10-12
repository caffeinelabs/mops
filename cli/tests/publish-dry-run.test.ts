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

  test("rejects oversized keywords", async () => {
    const cwd = await makeTempFixture("success");
    await writeFile(
      path.join(cwd, "mops.toml"),
      `[package]
name = "dry-run-fixture"
version = "0.1.0"
description = "Fixture for mops publish --dry-run"
license = "MIT"
keywords = ["this-keyword-is-way-too-long"]
`,
    );
    const result = await cli([...packagingArgs], {
      cwd,
      env: { CI: "1" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/max keyword length/i);
  });

  test("rejects package.files paths outside the package", async () => {
    const cwd = await makeTempFixture("success");
    await writeFile(
      path.join(cwd, "mops.toml"),
      `[package]
name = "dry-run-fixture"
version = "0.1.0"
description = "Fixture for mops publish --dry-run"
license = "MIT"
files = ["../outside.mo"]
`,
    );
    const result = await cli([...packagingArgs], {
      cwd,
      env: { CI: "1" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(
      /file path cannot start with/i,
    );
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

  // moc 2.0.0 has no legacy persistence, so the bench step must use the same
  // defaults as `mops bench` (incremental GC) rather than a legacy collector.
  test("runs the bench step with moc 2.0.0", async () => {
    const cwd = await makeTempFixture("success");
    await writeFile(
      path.join(cwd, "mops.toml"),
      `[package]
name = "dry-run-fixture"
version = "0.1.0"
description = "Fixture for mops publish --dry-run"
license = "MIT"

[dependencies]
core = "2.0.0"

[toolchain]
moc = "2.0.0"
pocket-ic = "12.0.0"
`,
    );
    // The bench canister only needs init() -> { getVersion; getSchema; runCell }.
    await mkdir(path.join(cwd, "bench"), { recursive: true });
    await writeFile(
      path.join(cwd, "bench", "sanity.bench.mo"),
      `module {
  type Schema = { name : Text; description : Text; rows : [Text]; cols : [Text] };

  class Bench(schema : Schema, run : (Nat, Nat) -> ()) {
    public func getVersion() : Nat = 1;
    public func getSchema() : Schema = schema;
    public let runCell = run;
  };

  public func init() : Bench {
    let schema = { name = "Sanity"; description = ""; rows = ["a"]; cols = ["1"] };
    func run(_ri : Nat, _ci : Nat) {};
    Bench(schema, run);
  };
};
`,
    );
    // publish benchmarks the installed dependencies; it does not install them
    expect((await cli(["install"], { cwd })).exitCode).toBe(0);
    const result = await cli(
      ["publish", "--dry-run", "--no-docs", "--no-test"],
      {
        cwd,
        env: { CI: "1" },
      },
    );
    expect(result.stdout + result.stderr).not.toMatch(/legacy-persistence/);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Running benchmarks/);
    expect(result.stdout).toMatch(/Dry-run OK/);
  }, 180_000);
});
