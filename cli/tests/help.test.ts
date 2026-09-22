import { describe, expect, jest, test } from "@jest/globals";
import { cli } from "./helpers";
import { COMMAND_GROUPS } from "../help.js";

// Strips ANSI escapes so assertions read the text a user sees.
const plain = (s: string) =>
  s.replace(new RegExp(`\u001b\\[[0-9;]*m`, "g"), "");

describe("root help", () => {
  test("lists every command in a group exactly once", async () => {
    const { stdout } = await cli(["--help"]);
    const text = plain(stdout);

    // A command filed in two groups renders once, silently, and the header
    // check below cannot see it.
    const filed = COMMAND_GROUPS.flatMap((group) => group.commands);
    expect(new Set(filed).size).toBe(filed.length);

    const headers = text
      .split("\n")
      .filter(
        (line) =>
          /^[A-Z].*:$/.test(line) &&
          !line.startsWith("Usage") &&
          line !== "Options:",
      );
    const filled = COMMAND_GROUPS.filter((group) =>
      group.commands.some((name) => text.includes(name)),
    );
    expect(headers).toEqual(filled.map((group) => group.title));

    const commandLines = text
      .split("\n")
      .filter((line) => /^ {2}[a-z][\w-]*(\s|,|$)/.test(line));
    const names = commandLines.map((line) => line.trim().split(/[\s,]/)[0]);
    const unique = new Set(names);
    expect(names.length).toBe(unique.size);

    // The exact set, not just membership: an unfiled command would otherwise
    // show up under the catch-all "Other:" and pass unnoticed.
    const expected = [
      "init",
      "template",
      "add",
      "remove",
      "install",
      "outdated",
      "update",
      "sync",
      "verify",
      "publish",
      "bump",
      "owner",
      "maintainer",
      "user",
      "test",
      "watch",
      "bench",
      "format",
      "build",
      "check",
      "check-stable",
      "check-candid",
      "lint",
      "migrate",
      "generate",
      "deployed",
      "docs",
      "toolchain",
      "self",
      "search",
      "info",
      "cache",
      "sources",
      "moc-args",
      "help",
    ];
    expect([...unique].sort()).toEqual([...expected].sort());
    expect(text).not.toContain("\nOther:\n");
  });

  test("starts with the usage line", async () => {
    const { stdout } = await cli(["--help"]);
    expect(plain(stdout)).toMatch(/^Usage: mops/);
  });

  // Width is fixed at 80: `helpWidth` is not read from `COLUMNS` under a pipe,
  // which is how the suite and CI run it.
  test("fits an 80-column terminal", async () => {
    const { stdout } = await cli(["--help"]);
    const tooLong = plain(stdout)
      .split("\n")
      .filter((line) => line.length > 80);
    expect(tooLong).toEqual([]);
  });

  // Pins the term column, not just the total width: a wider or narrower term
  // column still fits 80 columns, so the check above cannot see it.
  test("aligns every description in one column", async () => {
    const { stdout } = await cli(["--help"]);
    const columns = plain(stdout)
      .split("\n")
      .filter((line) => /^ {2}\S/.test(line))
      .map((line) => {
        const gap = line.slice(2).match(/\s{2,}\S/);
        return gap ? gap.index! + gap[0].length + 1 : -1;
      });
    expect(new Set(columns).size).toBe(1);
    expect(columns[0]).toBe(17);
  });

  // Commander's own entries cannot be re-described at the call site, so
  // `MopsHelp` normalises their lowercase defaults.
  test("describes commander's own entries in sentence case", async () => {
    const { stdout } = await cli(["--help"]);
    const text = plain(stdout);
    expect(text).toMatch(/-v, --version\s+Show the version/);
    expect(text).toMatch(/-h, --help\s+Show help\b/);
    expect(text).toMatch(/^ {2}help\s+Show help for a command$/m);
    expect(text).not.toContain("display help for command");
    expect(text).not.toContain("output the version number");
  });
});

// A bare group name has to be a way in, not a dead end.
const SUBCOMMANDS: [string, string[]][] = [
  ["cache", ["show", "size", "clean"]],
  ["toolchain", ["use", "update", "info", "bin"]],
  ["user", ["get-principal", "import", "set", "get"]],
  ["self", ["update", "uninstall"]],
  ["owner", ["list", "add", "remove"]],
  ["maintainer", ["list", "add", "remove"]],
  ["migrate", ["new", "freeze"]],
  ["generate", ["candid"]],
  ["docs", ["generate", "coverage"]],
];

describe("command groups", () => {
  jest.setTimeout(180_000);

  test.each(SUBCOMMANDS)(
    "`mops %s` bare prints its subcommands and exits non-zero",
    async (name) => {
      const result = await cli([name]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(plain(result.stderr)).toMatch(/^Usage: mops/);
      expect(plain(result.stderr)).toContain("Commands:");
    },
  );

  // Spelled out rather than read from `COMMAND_GROUPS`, so a subcommand added
  // without its help saying so is caught.
  test.each(SUBCOMMANDS)(
    "`mops %s --help` names its subcommands",
    async (name, subcommands) => {
      const { exitCode, stdout } = await cli([name, "--help"]);
      expect(exitCode).toBe(0);
      for (const subcommand of subcommands) {
        expect(plain(stdout)).toContain(subcommand);
      }
    },
  );

  // AGENTS.md: every option and accepted argument appears in `--help` with a
  // non-empty description. Commander drops an argument's entry entirely when it
  // has no description, so read the argument names off the usage line.
  test.each([
    ...COMMAND_GROUPS.flatMap((group) => group.commands),
    ...SUBCOMMANDS.flatMap(([name, subs]) =>
      subs.map((sub) => `${name} ${sub}`),
    ),
  ])("`mops %s --help` describes every argument", async (path) => {
    const { stdout } = await cli([...path.split(" "), "--help"]);
    const text = plain(stdout);

    const usage = text.split("\n")[0] ?? "";
    const declared = [...usage.matchAll(/[<[]([a-zA-Z][\w-]*)/g)]
      .map((m) => m[1])
      .filter((name) => name !== "options" && name !== "command");
    if (declared.length === 0) {
      return;
    }

    const argumentSection = text.split("Arguments:")[1] ?? "";
    for (const name of declared) {
      expect(argumentSection).toMatch(
        new RegExp(`^ {2}${name}[\\w<>\\[\\].:-]*\\s{2,}\\S`, "m"),
      );
    }
  });

  test("`mops toolchain bin --help` and a missing argument both name the tools", async () => {
    const toolNames = ["moc", "wasmtime", "pocket-ic", "lintoko", "wasm-opt"];

    const { stdout } = await cli(["toolchain", "bin", "--help"]);
    const help = plain(stdout);
    expect(help).toMatch(/Arguments:/);
    expect(help).toMatch(/tool\s+tool to get the binary for/);
    for (const tool of toolNames) {
      expect(help).toContain(tool);
    }

    const missing = await cli(["toolchain", "bin"]);
    expect(missing.exitCode).toBe(1);
    for (const tool of toolNames) {
      expect(plain(missing.stderr)).toContain(tool);
    }
  });

  // `--global` belongs to `clean`, the only subcommand that reads it, so it has
  // to follow `clean` rather than precede it.
  test("`--global` is an option of `cache clean`, not of `cache`", async () => {
    const { stdout } = await cli(["cache", "clean", "--help"]);
    expect(plain(stdout)).toMatch(
      /--global\s+Delete only the global cache, keep the project's \.mops/,
    );

    const misplaced = await cli(["cache", "--global", "clean"]);
    expect(misplaced.exitCode).toBe(1);
    expect(plain(misplaced.stderr)).toContain("unknown option '--global'");
  });
});

// A missing argument must name the argument and show its usage, not stop at the
// error line.
describe("usage errors", () => {
  test.each([
    [["add"], "'pkg'"],
    [["remove"], "'pkg'"],
    [["info"], "'pkg'"],
    [["search"], "'text'"],
    [["toolchain", "bin"], "'tool'"],
  ])(
    "`mops %s` with a missing argument prints usage",
    async (args, argument) => {
      const result = await cli(args, { env: { CI: "1" } });
      expect(result.exitCode).toBe(1);
      const stderr = plain(result.stderr);
      expect(stderr).toContain(argument);
      expect(stderr).toMatch(/^Usage: mops/m);
    },
  );
});
