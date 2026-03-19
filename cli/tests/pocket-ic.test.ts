import { describe, test, expect } from "@jest/globals";
import path from "path";
import { cli } from "./helpers";

describe("pocket-ic", () => {
  test("runs tests with pocket-ic 12.0.0", async () => {
    const cwd = path.join(import.meta.dirname, "pocket-ic");
    const result = await cli(
      ["test", "--reporter", "verbose", "--replica", "pocket-ic"],
      { cwd },
    );

    expect(result.stderr).not.toContain("is not supported");
    expect(result.stderr).not.toContain(
      "only supports pocket-ic 9.x.x and 4.0.0",
    );
    expect(result.exitCode).toBe(0);
  });
});
