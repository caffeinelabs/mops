import { describe, expect, test } from "@jest/globals";
import path from "path";
import { cli } from "./helpers";

// The fixture has two test files on purpose: the pre-v3 default picked the
// `files` reporter as soon as a second file showed up, which hid Debug.print.
describe("test reporter", () => {
  const cwd = path.join(import.meta.dirname, "test-reporter");

  test("defaults to verbose with more than one test file", async () => {
    const result = await cli(["test"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/print from first/);
    expect(result.stdout).toMatch(/print from second/);
  });

  test("--reporter files prints only files", async () => {
    const result = await cli(["test", "--reporter", "files"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/test\/first\.test\.mo/);
    expect(result.stdout).not.toMatch(/print from first/);
  });
});
