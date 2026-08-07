import { describe, expect, jest, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import path from "path";
import { cli, useTempFixtures } from "./helpers";

// v3 dropped the packtool write, so `mops init` must leave a dfx.json alone.
// Asserted on bytes rather than parsed JSON: rewriting the file with identical
// content but different formatting would still be a regression.
describe("init", () => {
  jest.setTimeout(120_000);

  const makeTempFixture = useTempFixtures(
    path.join(import.meta.dirname, "init"),
  );

  test("leaves an existing dfx.json untouched", async () => {
    const cwd = await makeTempFixture("dfx-json");
    const dfxJson = path.join(cwd, "dfx.json");
    const before = readFileSync(dfxJson, "utf8");

    const result = await cli(["init", "--yes"], {
      cwd,
      env: { CI: undefined },
    });

    expect(result.exitCode).toBe(0);
    expect(readFileSync(dfxJson, "utf8")).toBe(before);
  });
});
