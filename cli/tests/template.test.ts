import { describe, expect, jest, test } from "@jest/globals";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cli, useTempFixtures } from "./helpers";

// `mops template <name>` is the non-interactive form the docs recommend; a
// prompt would hang a CI or agent loop rather than fail it.
describe("template", () => {
  jest.setTimeout(120_000);

  const makeTempFixture = useTempFixtures(
    path.join(import.meta.dirname, "template"),
  );

  test("writes the named template without prompting", async () => {
    const cwd = await makeTempFixture("project");

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

  test("rejects an unknown name and lists the valid ones", async () => {
    const cwd = await makeTempFixture("project");

    const result = await cli(["template", "bogus"], { cwd });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Allowed choices are");
    expect(result.stderr).toContain("github-workflow:mops-publish");
    expect(existsSync(path.join(cwd, "README.md"))).toBe(false);
  });
});
