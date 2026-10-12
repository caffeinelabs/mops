import { describe, expect, jest, test } from "@jest/globals";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "path";
import { cli, useTempFixtures } from "./helpers";

// Pin moc 1.16.1 (≥ 0.15) to exercise the EOP path — this repo's own mops.toml
// uses moc 0.14.14, so the default bench run is never EOP-tested here.
describe("bench", () => {
  jest.setTimeout(180_000);
  const makeTempFixture = useTempFixtures(
    path.join(import.meta.dirname, "bench"),
  );

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

  // The generated canister wrapper is compiled with the project's `[moc] args`,
  // so it must not trip lints a project may promote to errors.
  test("compiles the bench canister with lints as errors in [moc] args", async () => {
    const cwd = path.join(import.meta.dirname, "bench/moc-args-lint");
    try {
      const result = await cli(["bench"], { cwd });
      expect(result.stderr).not.toMatch(/M0223|M0236|M0237/);
      expect(result.exitCode).toBe(0);
    } finally {
      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
    }
  });

  // moc 1 requires `persistent` on the generated canister, and moc 2 warns
  // about it (M0217), so mops drops the keyword on moc 2.
  test("compiles the bench canister with -Werror on moc 2", async () => {
    const cwd = await makeTempFixture("moc-args-lint");
    writeFileSync(
      path.join(cwd, "mops.toml"),
      `[dependencies]
core = "2.0.0"

[toolchain]
moc = "2.0.0"
pocket-ic = "12.0.0"

[moc]
args = ["-Werror", "-E=M0223,M0236,M0237"]
`,
    );
    const result = await cli(["bench"], { cwd });
    expect(result.stderr).not.toMatch(/M0217|M0223|M0236|M0237/);
    expect(result.exitCode).toBe(0);
  });

  test("refuses legacy persistence on moc 2", async () => {
    const cwd = path.join(import.meta.dirname, "bench-allocation");
    try {
      for (const args of [["--gc", "copying"], ["--legacy-persistence"]]) {
        const result = await cli(["bench", ...args], { cwd });
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toMatch(
          `${args.join(" ")} needs legacy persistence, which moc 2.0.0 no longer has`,
        );
        expect(result.stderr).not.toMatch("unknown option");
      }
    } finally {
      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
    }
  });

  test("an invalid MOPS_POCKET_IC_URL fails fast with a clean error", async () => {
    // Validated once per invocation (cli.ts preAction), for every command:
    // a malformed value is broken environment config, and failing loudly
    // beats behavior that depends on which code path reads the URL first.
    const cwd = path.join(import.meta.dirname, "build/success");
    const result = await cli(["bench"], {
      cwd,
      env: { MOPS_POCKET_IC_URL: "not-a-url" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch("not a valid URL");
    expect(result.stderr).not.toMatch("at process");
  });

  // The `bench` fixture pins `[toolchain] moc = "1.16.1"`. Point DFX_MOC_PATH at a
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
      expect(result.stdout).toContain(path.join("moc", "1.16.1", "moc"));
    } finally {
      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
    }
  });

  test("reports exactly the cell's allocation, without harness overhead", async () => {
    const cwd = path.join(import.meta.dirname, "bench-allocation");
    try {
      const result = await cli(["bench", "--save"], { cwd });
      expect(result.exitCode).toBe(0);
      // nothing is collected during a cell, so the all-zero table is not
      // printed (the "Garbage Collection: 0%" summary line in CI output stays)
      expect(result.stdout).not.toMatch(/Garbage Collection\**\s*\n\s*\n\s*\|/);
      const saved = JSON.parse(
        readFileSync(path.join(cwd, ".bench/allocation.bench.json"), "utf8"),
      );
      const heap = Object.fromEntries(
        saved.results.map(
          ([cell, res]: [string, { rts_heap_size: number }]) => [
            cell,
            res.rts_heap_size,
          ],
        ),
      );
      // A 1000-element `[var Nat]` is a 24-byte header plus 8 bytes per slot.
      expect(heap).toEqual({
        "noop:a": 0,
        "noop:b": 0,
        "array:a": 8024,
        "array:b": 8024,
      });
    } finally {
      rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
      rmSync(path.join(cwd, ".bench"), { recursive: true, force: true });
    }
  });
});
