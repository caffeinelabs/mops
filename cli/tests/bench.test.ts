import { describe, expect, jest, test } from "@jest/globals";
import { rmSync } from "node:fs";
import path from "path";
import { cli } from "./helpers";

// Pin moc 1.3.0 (≥ 0.15) to exercise the EOP path — this repo's own mops.toml
// uses moc 0.14.14, so the default bench run is never EOP-tested here.
describe("bench", () => {
  jest.setTimeout(180_000);

  test("runs under EOP with the default gc", async () => {
    const cwd = path.join(import.meta.dirname, "bench");
    try {
      const result = await cli(["bench"], { cwd });
      expect(result.stderr).not.toContain("--copying-gc is not supported");
      expect(result.stderr).not.toContain(
        "Invalid compiler flag combination",
      );
      expect(result.exitCode).toBe(0);
    } finally {
      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
    }
  });
});
