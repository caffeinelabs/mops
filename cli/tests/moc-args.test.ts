import { describe, expect, test } from "@jest/globals";
import path from "path";
import { cli } from "./helpers";

describe("moc-args", () => {
  test("prints moc args from [moc] config", async () => {
    const cwd = path.join(import.meta.dirname, "check/moc-args");
    const result = await cli(["moc-args"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("--default-persistent-actors\n-Werror");
  });

  test("prints only global args when no extra [moc] args", async () => {
    const cwd = path.join(import.meta.dirname, "check/success");
    const result = await cli(["moc-args"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("--default-persistent-actors");
  });
});
