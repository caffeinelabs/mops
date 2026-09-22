import { describe, expect, jest, test } from "@jest/globals";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cli, useTempFixtures } from "./helpers";

// `mops template <name>` is the non-interactive form the docs and agent
// guidance both recommend, and it did not work: the command declared no
// argument, so commander rejected the name with `too many arguments` before
// the action ran, and the interactive picker ran instead. These tests pin the
// argument form, because a prompt would hang a CI or agent loop rather than
// fail it.
describe("template", () => {
  jest.setTimeout(120_000);

  const makeTempFixture = useTempFixtures(
    path.join(import.meta.dirname, "template"),
  );

  test("writes the named template without prompting", async () => {
    const cwd = await makeTempFixture("project");

    // The fixture has no TTY under execa, so the picker cannot stand in for
    // the argument and quietly make this pass.
    const result = await cli(["template", "readme"], { cwd });

    expect(result.exitCode).toBe(0);
    expect(readFileSync(path.join(cwd, "README.md"), "utf8")).toContain(
      "template-check",
    );
  });

  test("substitutes --copyright-owner into a license", async () => {
    const cwd = await makeTempFixture("project");

    const result = await cli(
      ["template", "license:MIT", "--copyright-owner", "Acme Corp"],
      { cwd },
    );

    expect(result.exitCode).toBe(0);
    expect(readFileSync(path.join(cwd, "LICENSE"), "utf8")).toContain(
      "Acme Corp",
    );
  });

  // A typo should fail with the list of names, not open a picker.
  test("rejects an unknown name and lists the valid ones", async () => {
    const cwd = await makeTempFixture("project");

    const result = await cli(["template", "bogus"], { cwd });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Allowed choices are");
    expect(result.stderr).toContain("github-workflow:mops-publish");
    expect(existsSync(path.join(cwd, "README.md"))).toBe(false);
  });
});
