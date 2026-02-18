import { describe, expect, test } from "@jest/globals";
import path from "path";
import { cli } from "./helpers";

describe("toolchain", () => {
  test("file URI", async () => {
    const cwd = path.join(import.meta.dirname, "toolchain");
    const result = await cli(["toolchain", "bin", "moc"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("./mock");
  });
});
