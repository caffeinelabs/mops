import { describe, expect, test } from "@jest/globals";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cli, useTempFixtures } from "./helpers";

// The fixture's `.gitignore` excludes `/test/generated`. Sources are written per test, the generated one as a
// generator would: an ignored file cannot be committed with the fixture.
const UNFORMATTED = `module {
public func sub(a:Nat,b:Nat):Nat{a-b};
}
`;
const GENERATED = "test/generated/Generated.test.mo";

describe.each([
  ["mo-fmt", undefined],
  ["the Prettier plugin", "[dependencies]\n"],
])("format with %s skips git-ignored files", (_, mopsToml) => {
  const makeTempFixture = useTempFixtures(import.meta.dirname);

  let setup = async () => {
    const cwd = await makeTempFixture("format-gitignore");
    if (mopsToml) {
      await writeFile(path.join(cwd, "mops.toml"), mopsToml);
    }
    for (const file of ["src/Messy.mo", GENERATED]) {
      await mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
      await writeFile(path.join(cwd, file), UNFORMATTED);
    }
    return cwd;
  };

  test("check, format, check again", async () => {
    const cwd = await setup();

    let result = await cli(["format", "--check"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/src\/Messy\.mo/);
    expect(result.stdout).not.toMatch(/Generated/);

    result = await cli(["format"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toMatch(/Generated/);
    expect(await readFile(path.join(cwd, GENERATED), "utf8")).toBe(UNFORMATTED);

    // Still unformatted, the generated file does not fail the check.
    result = await cli(["format", "--check"], { cwd });
    expect(result.exitCode).toBe(0);
  });

  test("the filter does not reach a git-ignored file", async () => {
    const cwd = await setup();

    const result = await cli(["format", "Generated", "--check"], { cwd });
    expect(result.stdout).toMatch(/No files found for filter 'Generated'/);
  });
});
