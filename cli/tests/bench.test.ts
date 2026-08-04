import { describe, expect, jest, test } from "@jest/globals";
import { rmSync } from "node:fs";
import path from "path";
import { cli } from "./helpers";

// The fixtures pin moc 1.3.0 (≥ 0.15) to exercise the EOP path — this repo's own
// mops.toml uses moc 0.14.14, so the default bench run is never EOP-tested here.
// The pin only applies when the toolchain wrapper is active (DFX_MOC_PATH=moc-wrapper,
// which CI auto-inits); a plain dev shell gets the dfx-bundled moc instead, so
// assertions here must not depend on one moc version's wording.
describe("bench", () => {
  jest.setTimeout(180_000);

  test("runs under EOP with the default gc", async () => {
    const cwd = path.join(import.meta.dirname, "bench");
    try {
      const result = await cli(["bench"], { cwd });
      expect(result.stderr).not.toContain("--copying-gc is not supported");
      expect(result.stderr).not.toContain("Invalid compiler flag combination");
      expect(result.exitCode).toBe(0);
    } finally {
      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
    }
  });

  test("rejects moc args with embedded spaces (single array entry with space)", async () => {
    const cwd = path.join(import.meta.dirname, "bench/moc-args-invalid");
    try {
      const result = await cli(["bench"], { cwd });
      expect(result.exitCode).not.toBe(0);
      // Wording depends on the moc that runs (1.3.0: `invalid warning code: …`,
      // dfx-bundled 0.16.1: `unknown option '…'` plus a --help dump), but both
      // echo the whole entry back in one diagnostic — that is the invariant: it
      // reached moc as a single argument instead of being split on the space.
      expect(result.stderr).toMatch(/moc: [^\n]*M0154 --legacy-persistence/);
    } finally {
      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
    }
  });
});
