import { describe, expect, test } from "@jest/globals";
import { getMocArgs } from "../commands/bench-gc-args";

// Regression: default `mops bench` on moc 0.15+ must compile under EOP with no
// legacy collector flag — `--copying-gc` is rejected under EOP and crashed every
// default run (introduced when bench switched to EOP-by-default).
describe("bench getMocArgs", () => {
  test("default options emit no legacy collector flag under EOP", () => {
    expect(
      getMocArgs({
        gc: "incremental",
        forceGc: true,
        legacyPersistence: false,
        compilerVersion: "0.15.0",
        profile: "Release",
      }),
    ).toBe(" --force-gc --release");
  });
});
