import { describe, expect, test } from "@jest/globals";
import {
  compareVersions,
  majorVersion,
  parseVersion,
} from "../helpers/compare-versions";

describe("compareVersions", () => {
  test("orders registry-shaped versions", () => {
    expect(compareVersions("1.2.3", "1.10.0")).toBe(-1);
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
  });

  // Registry versions are always `x.y.z`, but git refs (`#v1.2.0-rc.1`) reach
  // the same comparator, and the old parseInt comparator called every pair here
  // equal because `parseInt("0-rc")` is `0` and the 4th part was dropped.
  test("orders prereleases below their release", () => {
    expect(compareVersions("1.2.0-rc.1", "1.2.0")).toBe(-1);
    expect(compareVersions("1.2.0", "1.2.0-rc.1")).toBe(1);
    expect(compareVersions("1.2.0-rc.2", "1.2.0-rc.10")).toBe(-1);
    expect(compareVersions("1.2.0-alpha", "1.2.0-beta")).toBe(-1);
    expect(compareVersions("1.2.0-rc.1", "1.2.0-rc.1")).toBe(0);
  });

  // The old comparator compared `undefined - 1`, which is NaN and therefore
  // falsy, so it skipped the patch comparison and called these equal.
  test("coerces two-part versions", () => {
    expect(compareVersions("0.16", "0.16.1")).toBe(-1);
    expect(compareVersions("0.16", "0.16.0")).toBe(0);
    expect(compareVersions("1.2", "1.2.9")).toBe(-1);
    expect(compareVersions("2", "1.9.9")).toBe(1);
  });

  test("coerces versions carrying a prefix", () => {
    expect(compareVersions("v1.2.0", "1.2.0")).toBe(0);
    expect(compareVersions("release-v1.2.0", "1.0.0")).toBe(1);
    expect(compareVersions("moc-0.9.1", "0.9.0")).toBe(1);
  });

  test("sorts strings with no version in them as 0.0.0", () => {
    expect(compareVersions("main", "1.0.0")).toBe(-1);
    expect(compareVersions("", "1.0.0")).toBe(-1);
    expect(compareVersions("main", "master")).toBe(0);
    expect(compareVersions("main", "0.0.0")).toBe(0);
  });

  test("defaults missing versions to 0.0.0", () => {
    expect(compareVersions(undefined, "1.0.0")).toBe(-1);
    expect(compareVersions("1.0.0", undefined)).toBe(1);
    expect(compareVersions(undefined, undefined)).toBe(0);
  });

  test("never throws", () => {
    for (let value of ["", "...", "??", "1.2.3.4.5", "-", "9".repeat(400)]) {
      expect(() => compareVersions(value, "1.0.0")).not.toThrow();
    }
  });

  // Registry versions are validated by the backend as `xx.xx.xx` with no
  // prerelease (backend/main/utils/semver.mo), which is exactly the subset
  // where `Semver.compare` and `compareVersions` must agree.
  test("agrees with the backend Semver ordering on registry versions", () => {
    // [x, y, Semver.compare(x, y)] — Nat.compare on major, then minor, then patch
    let cases: Array<[string, string, -1 | 0 | 1]> = [
      ["0.0.0", "0.0.1", -1],
      ["0.9.0", "0.10.0", -1],
      ["1.2.3", "1.2.3", 0],
      ["1.2.3", "1.3.0", -1],
      ["2.0.0", "1.99.99", 1],
      ["10.0.0", "9.99.99", 1],
      ["0.16.1", "0.16.0", 1],
    ];
    for (let [x, y, expected] of cases) {
      expect(compareVersions(x, y)).toBe(expected);
    }
  });
});

describe("majorVersion", () => {
  test("reads the major of registry and coerced versions", () => {
    expect(majorVersion("1.2.3")).toBe(1);
    expect(majorVersion("0.16.1")).toBe(0);
    expect(majorVersion("2.0.0-rc.1")).toBe(2);
    expect(majorVersion("0.16")).toBe(0);
    expect(majorVersion("main")).toBe(0);
  });
});

describe("parseVersion", () => {
  test("keeps prerelease identifiers when coercing", () => {
    expect(parseVersion("1.2-rc.1").version).toBe("1.2.0-rc.1");
    expect(parseVersion("1.2.3").version).toBe("1.2.3");
    expect(parseVersion("main").version).toBe("0.0.0");
  });
});
