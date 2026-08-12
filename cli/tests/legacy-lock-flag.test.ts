import { describe, expect, jest, test } from "@jest/globals";
import { existsSync, readFileSync } from "node:fs";
import path from "path";
import { cli, useTempFixtures } from "./helpers";

// Temporary v2 compatibility shim: `--lock <mode>` is accepted and ignored on
// the five commands that took it in 2.x. Targeted assertions only (AGENTS.md).
describe("legacy --lock flag", () => {
  jest.setTimeout(120_000);

  const fixturesDir = path.join(import.meta.dirname, "install");
  const makeTempFixture = useTempFixtures(fixturesDir);
  const env = { CI: undefined };

  const readToml = (cwd: string) =>
    readFileSync(path.join(cwd, "mops.toml"), "utf8");

  // The regression the shim exists to prevent: tolerating `--lock` as an
  // unknown option would bind its value to the positional argument.
  test.each([
    ["flag first", ["add", "--lock", "update", "./packages/two"]],
    ["flag last", ["add", "./packages/two", "--lock", "update"]],
  ])("add resolves the right package with the %s", async (_name, args) => {
    const cwd = await makeTempFixture("legacy-lock");
    const result = await cli(args, { cwd, env });
    expect(result.exitCode).toBe(0);
    expect(readToml(cwd)).toMatch(/two = "\.\/packages\/two"/);
  });

  // Reported against the package name, so it doubles as a positional-binding
  // check on `remove`.
  test.each([
    ["update", ["remove", "--lock", "update", "nosuchpkg"]],
    ["ignore", ["remove", "nosuchpkg", "--lock", "ignore"]],
    // `check` is ignored too — the shim does not map it onto `--locked`.
    ["check", ["remove", "--lock", "check", "nosuchpkg"]],
    ["bogus", ["remove", "--lock", "bogus", "nosuchpkg"]],
  ])("remove accepts --lock %s", async (_mode, args) => {
    const cwd = await makeTempFixture("legacy-lock");
    const result = await cli(args, { cwd, env });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/No dependency to remove "nosuchpkg"/);
  });

  test.each([["update"], ["ignore"], ["check"], ["bogus"]])(
    "install --lock %s behaves like plain install",
    async (mode) => {
      const cwd = await makeTempFixture("legacy-lock");
      const result = await cli(["install", "--lock", mode], { cwd, env });
      expect(result.exitCode).toBe(0);
      // A missing lock would fail under `--locked`; here it is written.
      expect(existsSync(path.join(cwd, "mops.lock"))).toBe(true);
    },
  );

  test.each([["sync"], ["update"]])("%s accepts --lock update", async (cmd) => {
    const cwd = await makeTempFixture("legacy-lock");
    const result = await cli([cmd, "--lock", "update"], { cwd, env });
    expect(result.stderr).not.toMatch(/unknown option/);
  });

  // Deprecated surface stays out of --help.
  test.each([["add"], ["remove"], ["install"], ["sync"], ["update"]])(
    "%s --help does not advertise --lock",
    async (cmd) => {
      const result = await cli([cmd, "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toMatch(/--lock </);
    },
  );
});
