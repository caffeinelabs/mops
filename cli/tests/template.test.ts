import { describe, expect, jest, test } from "@jest/globals";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { TEMPLATES } from "../commands/template.js";
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

  // Every branch writes files and logs "Created"; a listed name with no branch
  // validates, does nothing and still exits 0.
  test.each(TEMPLATES.map((t) => t.name))(
    "writes something for the offered name %s",
    async (name) => {
      const cwd = await makeTempFixture("project");

      const result = await cli(["template", name], { cwd });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Created");
    },
  );

  // Pins the accepted set to TEMPLATES: a name offered by the picker but not
  // registered as a choice would be rejected here, and vice versa.
  test("rejects an unknown name and names every accepted one", async () => {
    const cwd = await makeTempFixture("project");

    const result = await cli(["template", "bogus"], { cwd });

    expect(result.exitCode).toBe(1);
    for (const { name } of TEMPLATES) {
      expect(result.stderr).toContain(name);
    }
    expect(existsSync(path.join(cwd, "README.md"))).toBe(false);
  });

  test("`--help` lists the accepted names", async () => {
    const result = await cli(["template", "--help"]);

    expect(result.exitCode).toBe(0);
    for (const { name } of TEMPLATES) {
      expect(result.stdout).toContain(name);
    }
  });
});
