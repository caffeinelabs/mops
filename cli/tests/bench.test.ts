import { describe, expect, test } from "@jest/globals";
import { getMocArgs, type BenchGcOptions } from "../commands/bench-gc-args";

const base: BenchGcOptions = {
  gc: "incremental",
  forceGc: true,
  legacyPersistence: false,
  compilerVersion: "0.15.0",
  profile: "Release",
};

describe("bench getMocArgs", () => {
  // Default run on moc 0.15+: EOP, GC fixed to incremental (no collector flag).
  test("default gc under EOP omits the collector flag", () => {
    expect(getMocArgs({ ...base })).toBe(" --force-gc --release");
  });

  test("explicit incremental under EOP omits the collector flag", () => {
    expect(getMocArgs({ ...base, gc: "incremental" })).toBe(
      " --force-gc --release",
    );
  });

  test("legacy gc implies --legacy-persistence on moc >= 0.15", () => {
    expect(getMocArgs({ ...base, gc: "copying" })).toBe(
      " --legacy-persistence --force-gc --copying-gc --release",
    );
    expect(getMocArgs({ ...base, gc: "compacting" })).toBe(
      " --legacy-persistence --force-gc --compacting-gc --release",
    );
    expect(getMocArgs({ ...base, gc: "generational" })).toBe(
      " --legacy-persistence --force-gc --generational-gc --release",
    );
  });

  test("--legacy-persistence with incremental keeps the collector flag", () => {
    expect(getMocArgs({ ...base, legacyPersistence: true })).toBe(
      " --legacy-persistence --force-gc --incremental-gc --release",
    );
  });

  // moc < 0.15: legacy is default, --legacy-persistence flag doesn't exist,
  // collector is freely selectable.
  test("moc < 0.15 emits the collector flag without --legacy-persistence", () => {
    expect(getMocArgs({ ...base, compilerVersion: "0.14.13" })).toBe(
      " --force-gc --incremental-gc --release",
    );
    expect(
      getMocArgs({ ...base, compilerVersion: "0.14.13", gc: "copying" }),
    ).toBe(" --force-gc --copying-gc --release");
  });

  test("Debug profile", () => {
    expect(getMocArgs({ ...base, profile: "Debug" })).toBe(
      " --force-gc --debug",
    );
  });
});
