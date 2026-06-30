import { describe, expect, jest, test } from "@jest/globals";
import { rmSync } from "node:fs";
import path from "path";
import { cli } from "./helpers";

// E2E: `mops bench` must run end-to-end under enhanced orthogonal persistence
// (moc >= 0.15) with the default gc. Regression: the default `--gc copying` was
// rejected under EOP and crashed every default bench run (discovered on a
// motoko-core release, not here, because this repo's own mops.toml pinned moc
// 0.14.14). This fixture pins moc 1.3.0 so the EOP path is actually exercised.
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
