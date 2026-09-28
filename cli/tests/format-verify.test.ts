import { describe, expect, test } from "@jest/globals";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cli, cliSnapshot, useTempFixtures } from "./helpers";

// Sources are written per test: lint-staged runs Prettier over committed
// `.mo` files, which would reformat an unformatted fixture on commit.
const MAIN = `import Lib "Lib";

persistent actor {
  public func get() : async Nat { Lib.add(1, 2) };
};
`;
const MESSY_LIB = `module {
public func add(a:Nat,b:Nat):Nat{a+b};
}
`;

// Stands in for a formatter bug: every file it touches stops compiling.
const BREAKING_FORMATTER = `#!/bin/sh
for f in "$@"; do
  case "$f" in --*) continue ;; esac
  printf 'let broken = ;\\n' >> "$f"
  echo "$f"
done
`;

describe("format --verify", () => {
  const makeTempFixture = useTempFixtures(import.meta.dirname);

  let setup = async (files: Record<string, string>) => {
    const cwd = await makeTempFixture("format-verify");
    await mkdir(path.join(cwd, "src"), { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      await writeFile(path.join(cwd, "src", name), content);
    }
    return cwd;
  };

  let pinBreakingFormatter = async (cwd: string) => {
    await writeFile(path.join(cwd, "fake-mo-fmt"), BREAKING_FORMATTER);
    await chmod(path.join(cwd, "fake-mo-fmt"), 0o755);
    const toml = path.join(cwd, "mops.toml");
    await writeFile(
      toml,
      (await readFile(toml, "utf8")).replace(
        'mo-fmt = "0.2.0"',
        'mo-fmt = "./fake-mo-fmt"',
      ),
    );
  };

  let read = (cwd: string, name: string) =>
    readFile(path.join(cwd, "src", name), "utf8");

  test("keeps formatting that passes mops check", async () => {
    const cwd = await setup({ "main.mo": MAIN, "Lib.mo": MESSY_LIB });

    await cliSnapshot(["format", "--verify"], { cwd }, 0);
    expect(await read(cwd, "Lib.mo")).not.toBe(MESSY_LIB);
  });

  test("reverts every formatted file when mops check fails", async () => {
    const cwd = await setup({ "main.mo": MAIN, "Lib.mo": MESSY_LIB });
    await pinBreakingFormatter(cwd);

    await cliSnapshot(["format", "--verify"], { cwd }, 1);
    expect(await read(cwd, "main.mo")).toBe(MAIN);
    expect(await read(cwd, "Lib.mo")).toBe(MESSY_LIB);
  });

  test("a package without canisters checks the formatted files", async () => {
    const cwd = await setup({ "Lib.mo": MESSY_LIB });
    await writeFile(
      path.join(cwd, "mops.toml"),
      '[toolchain]\nmoc = "1.3.0"\nmo-fmt = "./fake-mo-fmt"\n',
    );
    await pinBreakingFormatter(cwd);

    const result = await cli(["format", "--verify"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/Check failed for file src\/Lib\.mo/);
    expect(await read(cwd, "Lib.mo")).toBe(MESSY_LIB);
  });

  test("works with the bundled Prettier formatter too", async () => {
    const cwd = await setup({ "main.mo": MAIN, "Lib.mo": MESSY_LIB });
    await writeFile(
      path.join(cwd, "mops.toml"),
      '[toolchain]\nmoc = "1.3.0"\n\n[canisters.backend]\nmain = "src/main.mo"\n',
    );

    const result = await cli(["format", "--verify"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/mops check passed/);
    expect(await read(cwd, "Lib.mo")).not.toBe(MESSY_LIB);
  });

  // The case --verify exists for: moc 1.x cannot parse the moc2 forms.
  test("reverts --syntax moc2 output the pinned moc rejects", async () => {
    const legacy = `module {
  public func sign(x : Int) : Int {
    if (x < 0) -1 else 1;
  };
};
`;
    const cwd = await setup({
      "main.mo": `import Sign "Sign";

persistent actor {
  public func get() : async Int { Sign.sign(-3) };
};
`,
      "Sign.mo": legacy,
    });

    const result = await cli(["format", "--verify", "--", "--syntax", "moc2"], {
      cwd,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/formatting of 1 file was reverted/);
    expect(await read(cwd, "Sign.mo")).toBe(legacy);
  });

  test("skips mops check when nothing was reformatted", async () => {
    const cwd = await setup({ "main.mo": MAIN });

    const result = await cli(["format", "--verify"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toMatch(/Verifying/);
  });

  test("conflicts with --check", async () => {
    const cwd = await setup({ "main.mo": MAIN });

    const result = await cli(["format", "--verify", "--check"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(
      /option '--verify' cannot be used with option '--check'/,
    );
  });
});
