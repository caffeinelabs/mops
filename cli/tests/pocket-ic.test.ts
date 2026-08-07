import { describe, test, expect } from "@jest/globals";
import path from "path";
import { readFile, writeFile } from "node:fs/promises";
import { cli, useTempFixtures } from "./helpers";
import {
  DEFAULT_POCKET_IC_VERSION,
  MIN_POCKET_IC_VERSION,
} from "../commands/toolchain/pocket-ic-versions";

const fixturesDir = import.meta.dirname;
const makeTempFixture = useTempFixtures(fixturesDir);

// Rewrite the `pocket-ic` pin in a throwaway copy of the fixture.
async function fixtureWithPin(version: string): Promise<string> {
  const cwd = await makeTempFixture("pocket-ic");
  const toml = path.join(cwd, "mops.toml");
  const text = await readFile(toml, "utf8");
  await writeFile(toml, text.replace("12.0.0", version));
  return cwd;
}

describe("pocket-ic", () => {
  test("runs replica tests with a pinned pocket-ic", async () => {
    const cwd = path.join(fixturesDir, "pocket-ic");
    const result = await cli(["test", "--reporter", "verbose"], { cwd });

    expect(result.stderr).not.toContain("is not supported");
    expect(result.exitCode).toBe(0);
  }, 300_000);

  // With no `[toolchain] pocket-ic`, mops downloads and runs
  // DEFAULT_POCKET_IC_VERSION rather than reaching for a dfx-provided replica.
  test("runs replica tests with no pocket-ic pin", async () => {
    const cwd = path.join(fixturesDir, "pocket-ic-default");
    const result = await cli(["test", "--reporter", "verbose"], { cwd });

    expect(result.stderr).not.toContain("is not supported");
    expect(result.exitCode).toBe(0);
  }, 300_000);

  // A `< 9.0.0` pin worked in 2.x through the legacy client this release
  // removes, so it has to fail with a migration message rather than the
  // client's own BinTimeoutError.
  test("rejects a pin below the minimum supported version", async () => {
    const cwd = await fixtureWithPin("4.0.0");
    const result = await cli(["test", "--reporter", "verbose"], { cwd });

    expect(result.stderr).toContain(
      `pocket-ic 4.0.0 is no longer supported. mops 3.0.0 removed the legacy PocketIC client, so pins below ${MIN_POCKET_IC_VERSION} no longer work.`,
    );
    expect(result.stdout).toContain(
      `mops toolchain use pocket-ic ${DEFAULT_POCKET_IC_VERSION}`,
    );
    expect(result.exitCode).toBe(1);
  }, 120_000);
});
