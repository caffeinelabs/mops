import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { existsSync, readFileSync } from "node:fs";
import { cp, rm } from "node:fs/promises";
import path from "path";
import { cli, cliSnapshot } from "./helpers";

const fixturesDir = path.join(import.meta.dirname, "generate");

describe("generate candid", () => {
  jest.setTimeout(120_000);

  const tempDirs: string[] = [];

  async function makeTempFixture(fixture: string): Promise<string> {
    const src = path.join(fixturesDir, fixture);
    const dest = path.join(fixturesDir, `_tmp_${fixture}_${Date.now()}`);
    await cp(src, dest, { recursive: true });
    tempDirs.push(dest);
    return dest;
  }

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  test("default path: writes <main-dir>/<name>.did and sets [canisters.<name>].candid", async () => {
    const cwd = await makeTempFixture("basic");
    const tomlBefore = readFileSync(path.join(cwd, "mops.toml"), "utf-8");
    expect(tomlBefore).not.toMatch(/"src\/foo\.did"/);

    await cliSnapshot(["generate", "candid", "foo"], { cwd }, 0);

    const did = readFileSync(path.join(cwd, "src/foo.did"), "utf-8");
    expect(did).toMatchSnapshot("src/foo.did");

    const tomlAfter = readFileSync(path.join(cwd, "mops.toml"), "utf-8");
    expect(tomlAfter).toMatch(/candid\s*=\s*"src\/foo\.did"/);
  });

  test("configured path: overwrites in place and does not touch mops.toml", async () => {
    const cwd = await makeTempFixture("basic");
    const tomlBefore = readFileSync(path.join(cwd, "mops.toml"), "utf-8");
    const didBefore = readFileSync(path.join(cwd, "candid/bar.did"), "utf-8");
    expect(didBefore).toMatch(/Hand-curated/);

    await cliSnapshot(["generate", "candid", "bar"], { cwd }, 0);

    const didAfter = readFileSync(path.join(cwd, "candid/bar.did"), "utf-8");
    expect(didAfter).not.toMatch(/Hand-curated/);
    expect(didAfter).toMatch(/greet/);
    expect(readFileSync(path.join(cwd, "mops.toml"), "utf-8")).toBe(tomlBefore);
  });

  test("no canister names: processes all canisters", async () => {
    const cwd = await makeTempFixture("basic");
    await cliSnapshot(["generate", "candid"], { cwd }, 0);

    expect(existsSync(path.join(cwd, "src/foo.did"))).toBe(true);
    const barDid = readFileSync(path.join(cwd, "candid/bar.did"), "utf-8");
    expect(barDid).toMatch(/greet/);
    expect(barDid).not.toMatch(/Hand-curated/);
  });

  test("--output writes to the given path and does not touch mops.toml", async () => {
    const cwd = await makeTempFixture("basic");
    const outPath = path.join(cwd, "out/custom.did");
    const tomlBefore = readFileSync(path.join(cwd, "mops.toml"), "utf-8");

    const result = await cli(["generate", "candid", "foo", "-o", outPath], {
      cwd,
    });
    expect(result.exitCode).toBe(0);
    expect(existsSync(outPath)).toBe(true);
    expect(readFileSync(outPath, "utf-8")).toMatch(/call/);
    expect(existsSync(path.join(cwd, "src/foo.did"))).toBe(false);
    expect(readFileSync(path.join(cwd, "mops.toml"), "utf-8")).toBe(tomlBefore);
  });

  test("--output rejected with multiple canisters", async () => {
    const cwd = await makeTempFixture("basic");
    const result = await cli(
      ["generate", "candid", "foo", "bar", "-o", "x.did"],
      { cwd },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/single canister/i);
  });

  test("unknown canister name errors", async () => {
    const cwd = await makeTempFixture("basic");
    const result = await cli(["generate", "candid", "nope"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/not found in mops\.toml/i);
  });

  test("moc failure: leaves destination and mops.toml untouched", async () => {
    const cwd = await makeTempFixture("error");
    const tomlBefore = readFileSync(path.join(cwd, "mops.toml"), "utf-8");

    const result = await cli(["generate", "candid", "broken"], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/Failed to generate Candid/);
    expect(existsSync(path.join(cwd, "src/broken.did"))).toBe(false);
    expect(readFileSync(path.join(cwd, "mops.toml"), "utf-8")).toBe(tomlBefore);
  });

  test("rejects destination inside .mops/", async () => {
    const cwd = await makeTempFixture("basic");
    const result = await cli(
      ["generate", "candid", "foo", "-o", ".mops/foo.did"],
      { cwd },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/\.mops\//);
    expect(result.stderr).toMatch(/Refusing/i);
  });

  test("creates file when [canisters.<name>].candid points to a missing path", async () => {
    const cwd = await makeTempFixture("basic");
    // bar's candid path points to candid/bar.did — delete it first
    await rm(path.join(cwd, "candid/bar.did"));

    const result = await cli(["generate", "candid", "bar"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(cwd, "candid/bar.did"))).toBe(true);
  });

  test("--output collision with another canister's candid prints a warning", async () => {
    const cwd = await makeTempFixture("basic");
    const result = await cli(
      ["generate", "candid", "foo", "-o", "candid/bar.did"],
      { cwd },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toMatch(/collides with \[canisters\.bar\]\.candid/);
  });
});
