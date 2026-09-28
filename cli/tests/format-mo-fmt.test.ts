import { describe, expect, test } from "@jest/globals";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cli, cliSnapshot, useTempFixtures } from "./helpers";

// Sources are written per test: lint-staged runs Prettier over committed
// `.mo` files, which would reformat an unformatted fixture on commit.
const FORMATTED = `module {
  public func add(a : Nat, b : Nat) : Nat {
    a + b;
  };
};
`;
const UNFORMATTED = `module {
public func sub(a:Nat,b:Nat):Nat{a-b};
}
`;

describe("format with mo-fmt pinned", () => {
  const makeTempFixture = useTempFixtures(import.meta.dirname);

  let setup = async (files: Record<string, string>) => {
    const cwd = await makeTempFixture("format-mo-fmt");
    await mkdir(path.join(cwd, "src"), { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      await writeFile(path.join(cwd, "src", name), content);
    }
    return cwd;
  };

  test("check, format, check again", async () => {
    const cwd = await setup({
      "Clean.mo": FORMATTED,
      "Messy.mo": UNFORMATTED,
    });

    await cliSnapshot(["format", "--check"], { cwd }, 1);
    expect(await readFile(path.join(cwd, "src/Messy.mo"), "utf8")).toBe(
      UNFORMATTED,
    );

    await cliSnapshot(["format"], { cwd }, 0);
    await cliSnapshot(["format", "--check"], { cwd }, 0);
  });

  test("the filter narrows the files passed to mo-fmt", async () => {
    const cwd = await setup({
      "Clean.mo": FORMATTED,
      "Messy.mo": UNFORMATTED,
    });

    const result = await cli(["format", "Clean", "--check"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toMatch(/Messy\.mo/);
  });

  // No fallback to the bundled Prettier plugin, so `.prettierrc` is inert.
  test(".prettierrc is not read", async () => {
    const cwd = await setup({ "Messy.mo": UNFORMATTED });
    await writeFile(path.join(cwd, ".prettierrc"), `{ "useTabs": true }\n`);

    const result = await cli(["format"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(await readFile(path.join(cwd, "src/Messy.mo"), "utf8")).not.toMatch(
      /\t/,
    );
  });

  test("a file that fails leaves it untouched and fails the run", async () => {
    const broken = "module {\n  public func broken( : Nat {\n};\n";
    const cwd = await setup({
      "Broken.mo": broken,
      "Messy.mo": UNFORMATTED,
    });

    const result = await cli(["format"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/^src\/Broken\.mo:2:\d+: /m);
    expect(await readFile(path.join(cwd, "src/Broken.mo"), "utf8")).toBe(
      broken,
    );
    // The other files are still formatted.
    expect(result.stdout).toMatch(/^src\/Messy\.mo$/m);
  });
});
