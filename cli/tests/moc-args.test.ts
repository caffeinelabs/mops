import { describe, expect, test } from "@jest/globals";
import path from "path";
import { cli } from "./helpers";

describe("moc-args", () => {
  test("prints moc args from [moc] config", async () => {
    const cwd = path.join(import.meta.dirname, "check/moc-args");
    const result = await cli(["moc-args"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("-Werror");
  });

  test("prints nothing when no [moc] config", async () => {
    const cwd = path.join(import.meta.dirname, "check/success");
    const result = await cli(["moc-args"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });
});
