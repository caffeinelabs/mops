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
      expect(result.stderr).toMatch(/invalid warning code/);
    } finally {
      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
    }
  });

  // The `bench` fixture pins `[toolchain] moc = "1.3.0"`. Point DFX_MOC_PATH at a
  // nonexistent binary: if bench resolved the compiler through DFX_MOC_PATH (the bug),
  // the build would fail trying to exec it. It must use the toolchain-managed pin instead.
  test("uses pinned [toolchain] moc, ignoring DFX_MOC_PATH", async () => {
    const cwd = path.join(import.meta.dirname, "bench");
    try {
      const result = await cli(["bench", "--verbose"], {
        cwd,
        env: { DFX_MOC_PATH: "/nonexistent/decoy-moc" },
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain("decoy-moc");
      expect(result.stdout).toContain(path.join("moc", "1.3.0", "moc"));
    } finally {
      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
    }
  });
});
