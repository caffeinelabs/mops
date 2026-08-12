import { describe, expect, jest, test } from "@jest/globals";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cli, useTempFixtures } from "./helpers";

describe("mops remove", () => {
  jest.setTimeout(60_000);

  const makeTempFixture = useTempFixtures(
    path.join(import.meta.dirname, "remove"),
  );

  // Local path deps carry an empty version, which used to reach
  // `getDependencyType` through the `.mops` cleanup and throw.
  test("removes a local path dependency", async () => {
    const cwd = await makeTempFixture("local-path");

    const result = await cli(["remove", "one"], { cwd, env: { CI: "1" } });

    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Package removed one = "\.\/packages\/one"/);

    const config = readFileSync(path.join(cwd, "mops.toml"), "utf8");
    expect(config).not.toMatch(/one\s*=/);
    // the dep source itself is the user's own code — untouched
    expect(existsSync(path.join(cwd, "packages/one/mops.toml"))).toBe(true);
  });
});
