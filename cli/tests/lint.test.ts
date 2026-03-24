import { describe, expect, test } from "@jest/globals";
import path from "path";
import { cli, cliSnapshot } from "./helpers";

describe("lint", () => {
  test("ok", async () => {
    const cwd = path.join(import.meta.dirname, "lint");
    await cliSnapshot(["lint", "Ok", "--verbose"], { cwd }, 0);
  });

  test("error", async () => {
    const cwd = path.join(import.meta.dirname, "lint");
    await cliSnapshot(["lint", "--verbose"], { cwd }, 1);
    await cliSnapshot(["lint", "NoBoolSwitch", "--verbose"], { cwd }, 1);
    await cliSnapshot(["lint", "DoesNotExist"], { cwd }, 1);
  });

  test("[lint] rules - additional config rules directory is used", async () => {
    const cwd = path.join(import.meta.dirname, "lint-config-rules");
    const ok = await cli(["lint", "Ok"], { cwd });
    expect(ok.exitCode).toBe(0);

    const fail = await cli(["lint", "NoBoolSwitch"], { cwd });
    expect(fail.exitCode).toBe(1);
    expect(fail.stderr).toMatch(/no-bool-switch/);
  });

  test("[lint] extends named - picks up rules/ from named dependency", async () => {
    const cwd = path.join(import.meta.dirname, "lint-extends-named");
    const ok = await cli(["lint", "Ok"], { cwd });
    expect(ok.exitCode).toBe(0);

    const fail = await cli(["lint", "NoBoolSwitch"], { cwd });
    expect(fail.exitCode).toBe(1);
    expect(fail.stderr).toMatch(/no-bool-switch/);
  });

  test("[lint] extends true - picks up rules/ from all dependencies", async () => {
    const cwd = path.join(import.meta.dirname, "lint-extends-all");
    const ok = await cli(["lint", "Ok"], { cwd });
    expect(ok.exitCode).toBe(0);

    const fail = await cli(["lint", "NoBoolSwitch"], { cwd });
    expect(fail.exitCode).toBe(1);
    expect(fail.stderr).toMatch(/no-bool-switch/);
  });

  test("[lint] extends named - dep not in extends list is ignored", async () => {
    // my-pkg has rules/ but extends only lists "other-pkg" (which doesn't exist),
    // so no dep rules are loaded and NoBoolSwitch.mo passes with exit 0.
    const cwd = path.join(import.meta.dirname, "lint-extends-ignored");
    const result = await cli(["lint", "NoBoolSwitch"], { cwd });
    expect(result.exitCode).toBe(0);
  });
});
