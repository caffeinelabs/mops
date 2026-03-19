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

  test("file URI with subdirectory path", async () => {
    const cwd = path.join(import.meta.dirname, "toolchain-local-subpath");
    const result = await cli(["toolchain", "bin", "moc"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("./bin/moc");
  });

  test("file URI does not trigger download during install", async () => {
    const cwd = path.join(import.meta.dirname, "toolchain-local-subpath");
    const result = await cli(["install"], { cwd });
    expect(result.stderr).not.toContain("Invalid Version");
  });
});
