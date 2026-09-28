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
// Legacy syntax `--syntax moc2` rewrites, and preserve leaves alone.
const LEGACY = `module {
  public func sign(x : Int) : Int {
    if (x < 0) -1 else 1;
  };
};
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

  describe("arguments after --", () => {
    test("are forwarded to mo-fmt", async () => {
      const cwd = await setup({ "Legacy.mo": LEGACY });

      const result = await cli(["format", "--", "--syntax", "moc2"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(await readFile(path.join(cwd, "src/Legacy.mo"), "utf8")).toBe(
        LEGACY.replace("if (x < 0) -1 else 1;", "if x < 0 { -1 } else { 1 };"),
      );
    });

    test("--check suggests the command with the same flags", async () => {
      const cwd = await setup({ "Legacy.mo": LEGACY });

      const result = await cli(
        ["format", "Legacy", "--check", "--", "--syntax", "moc2"],
        { cwd },
      );
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toMatch(
        /Run 'mops format Legacy -- --syntax moc2' to format your code/,
      );
      expect(await readFile(path.join(cwd, "src/Legacy.mo"), "utf8")).toBe(
        LEGACY,
      );
    });

    test("a flag mo-fmt rejects fails the run", async () => {
      const cwd = await setup({ "Legacy.mo": LEGACY });

      const result = await cli(["format", "--", "--syntax", "nope"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/invalid value 'nope' for '--syntax/);
    });

    test("are rejected when mo-fmt is not pinned", async () => {
      const cwd = await setup({ "Legacy.mo": LEGACY });
      await writeFile(path.join(cwd, "mops.toml"), "[dependencies]\n");

      const result = await cli(["format", "--", "--syntax", "moc2"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/forwarded to mo-fmt, which is not pinned/);
      expect(result.stderr).toMatch(/mops toolchain use mo-fmt 0\.2\.0/);
      expect(await readFile(path.join(cwd, "src/Legacy.mo"), "utf8")).toBe(
        LEGACY,
      );
    });
  });

  test("more than one filter is rejected", async () => {
    const cwd = await setup({ "Clean.mo": FORMATTED });

    const result = await cli(["format", "Clean", "Messy"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/mops format takes one filter/);
  });
});
