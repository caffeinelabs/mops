import { describe, expect, test } from "@jest/globals";
import { semver, isRange, stripRangePrefix } from "../semver";

describe("isRange", () => {
  test("caret is range", () => expect(isRange("^1.0.0")).toBe(true));
  test("tilde is range", () => expect(isRange("~1.0.0")).toBe(true));
  test("exact is not range", () => expect(isRange("1.0.0")).toBe(false));
  test("empty is not range", () => expect(isRange("")).toBe(false));
});

describe("stripRangePrefix", () => {
  test("strips caret", () => expect(stripRangePrefix("^1.0.0")).toBe("1.0.0"));
  test("strips tilde", () => expect(stripRangePrefix("~1.0.0")).toBe("1.0.0"));
  test("keeps exact", () => expect(stripRangePrefix("1.0.0")).toBe("1.0.0"));
  test("keeps empty", () => expect(stripRangePrefix("")).toBe(""));
});

describe("semver re-export works for version ranges", () => {
  test("satisfies caret", () => {
    expect(semver.satisfies("1.5.0", "^1.2.3")).toBe(true);
    expect(semver.satisfies("2.0.0", "^1.2.3")).toBe(false);
  });

  test("satisfies tilde", () => {
    expect(semver.satisfies("1.2.9", "~1.2.3")).toBe(true);
    expect(semver.satisfies("1.3.0", "~1.2.3")).toBe(false);
  });

  test("satisfies pre-1.0 caret", () => {
    expect(semver.satisfies("0.2.5", "^0.2.3")).toBe(true);
    expect(semver.satisfies("0.3.0", "^0.2.3")).toBe(false);
  });

  test("maxSatisfying picks highest within range", () => {
    let versions = ["1.0.0", "1.2.0", "1.5.0", "1.99.0", "2.0.0"];
    expect(semver.maxSatisfying(versions, "^1.2.0")).toBe("1.99.0");
    expect(semver.maxSatisfying(versions, "~1.2.0")).toBe("1.2.0");
  });

  test("compare returns -1, 0, 1", () => {
    expect(semver.compare("1.0.0", "2.0.0")).toBe(-1);
    expect(semver.compare("1.0.0", "1.0.0")).toBe(0);
    expect(semver.compare("2.0.0", "1.0.0")).toBe(1);
  });
});
