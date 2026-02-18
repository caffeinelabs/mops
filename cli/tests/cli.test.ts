import { describe, expect, test } from "@jest/globals";
import { cli } from "./helpers";

describe("cli", () => {
  test("--version", async () => {
    expect((await cli(["--version"])).stdout).toMatch(/CLI \d+\.\d+\.\d+/);
  });

  test("--help", async () => {
    expect((await cli(["--help"])).stdout).toMatch(/^Usage: mops/m);
  });
});
