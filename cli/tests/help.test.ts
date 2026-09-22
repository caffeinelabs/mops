import { describe, expect, test } from "@jest/globals";
import { cli } from "./helpers";

// Strips ANSI escapes so assertions read the text a user sees.
const plain = (s: string) =>
  s.replace(new RegExp(`\u001b\\[[0-9;]*m`, "g"), "");

// `mops --help` has to be a map of the CLI, not a wall: every top-level
// command is listed, grouped by task, on a line that fits a standard terminal.
// These tests pin that contract so a new command cannot be added without
// deciding where it belongs, and a long summary cannot quietly stop wrapping.
describe("root help", () => {
  test("lists every command in a group exactly once", async () => {
    const { stdout } = await cli(["--help"]);
    const text = plain(stdout);

    // The group headers come from `COMMAND_GROUPS` in `cli/help.ts`; a group
    // with no members is skipped, so this also catches a group emptied by a
    // rename without the group being updated with it.
    const headers = text
      .split("\n")
      .filter((line) => /^[A-Z].*:$/.test(line) && !line.startsWith("Usage"));
    expect(headers.length).toBeGreaterThan(0);

    for (const header of headers) {
      expect(header).toMatch(/^[A-Z][A-Za-z ]*:$/);
    }

    // Commands are indented two spaces under their group header. Count each
    // name once, so a command filed twice or missed entirely fails here.
    const commandLines = text
      .split("\n")
      .filter((line) => /^ {2}[a-z][\w-]*(\s|,|$)/.test(line));
    const names = commandLines.map((line) => line.trim().split(/[\s,]/)[0]);
    const unique = new Set(names);
    expect(names.length).toBe(unique.size);

    // Every one of these is a top-level command the docs describe. Pinning the
    // exact set — not just membership — is what makes an unfiled command fail:
    // it would otherwise show up under the catch-all "Other:" and leave the
    // listing silently out of date with the CLI.
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

  // A root entry is a name, an optional alias list, and a one-line summary.
  // The terminal width is fixed at 80 because `helpWidth` is not read from
  // `COLUMNS` when stdout is a pipe, which is the case under test and in CI.
  test("fits an 80-column terminal", async () => {
    const { stdout } = await cli(["--help"]);
    const tooLong = plain(stdout)
      .split("\n")
      .filter((line) => line.length > 80);
    expect(tooLong).toEqual([]);
  });

  // The `help` command and the `--help`/`--version` flags are commander's, so
  // their descriptions cannot be set at the call site. They are normalised to
  // mops' sentence case in `MopsHelp`, and this pins that they stay that way
  // rather than regressing to commander's lowercase fragments.
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

// The complaint that started this: `mops cache` printed nothing useful, and
// `mops cache --help` did not say what the command could do.
describe("command groups", () => {
  test.each([
    "cache",
    "toolchain",
    "user",
    "self",
    "owner",
    "maintainer",
    "migrate",
    "generate",
    "docs",
  ])(
    "`mops %s` bare prints its subcommands and exits non-zero",
    async (name) => {
      const result = await cli([name]);
      expect(result.exitCode).toBe(1);
      // The listing goes to stderr: the command did not do the work asked of it,
      // so it must not claim stdout as a result.
      expect(result.stdout).toBe("");
      expect(plain(result.stderr)).toMatch(/^Usage: mops/);
      expect(plain(result.stderr)).toContain("Commands:");
    },
  );

  // A group is only explorable if `--help` names every subcommand it takes, so
  // these lists are spelled out rather than read from `COMMAND_GROUPS`: the
  // point is to notice when a subcommand is added and its help does not say so.
  test.each([
    ["cache", ["show", "size", "clean"]],
    ["toolchain", ["use", "update", "info", "bin"]],
    ["user", ["get-principal", "import", "set", "get"]],
    ["self", ["update", "uninstall"]],
    ["owner", ["list", "add", "remove"]],
    ["maintainer", ["list", "add", "remove"]],
    ["migrate", ["new", "freeze"]],
    ["generate", ["candid"]],
    ["docs", ["generate", "coverage"]],
  ])("`mops %s --help` names its subcommands", async (name, subcommands) => {
    const { exitCode, stdout } = await cli([name, "--help"]);
    expect(exitCode).toBe(0);
    for (const subcommand of subcommands) {
      expect(plain(stdout)).toContain(subcommand);
    }
  });

  // The command group the user named: `mops toolchain bin --help` has to say
  // which tools the argument accepts, not just that it wants one.
  test("`mops toolchain bin --help` and a missing argument both name the tools", async () => {
    const toolNames = ["moc", "wasmtime", "pocket-ic", "lintoko", "wasm-opt"];

    const { stdout } = await cli(["toolchain", "bin", "--help"]);
    const help = plain(stdout);
    expect(help).toMatch(/Arguments:/);
    expect(help).toMatch(/tool\s+tool to get the binary for/);
    for (const tool of toolNames) {
      expect(help).toContain(tool);
    }

    // Omitting the argument is the other way a user arrives here, so the
    // usage block that follows the error has to name the tools too.
    const missing = await cli(["toolchain", "bin"]);
    expect(missing.exitCode).toBe(1);
    for (const tool of toolNames) {
      expect(plain(missing.stderr)).toContain(tool);
    }
  });
});

// `error: missing required argument 'pkg'` with nothing after it leaves a user
// with no way forward. Commander only appends the usage block once
// `showHelpAfterError()` is set, which `installMopsHelp` does for every command.
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
