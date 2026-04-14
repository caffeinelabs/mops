import { describe, expect, test } from "@jest/globals";
import {
  parseRange,
  satisfies,
  compareVersions,
  upperBound,
  highestSatisfying,
  isRange,
  stripRangePrefix,
  formatRange,
} from "../semver";

describe("compareVersions", () => {
  test("equal versions", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  test("major difference", () => {
    expect(compareVersions("2.0.0", "1.0.0")).toBe(1);
    expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
  });

  test("minor difference", () => {
    expect(compareVersions("1.3.0", "1.2.0")).toBe(1);
    expect(compareVersions("1.2.0", "1.3.0")).toBe(-1);
  });

  test("patch difference", () => {
    expect(compareVersions("1.2.4", "1.2.3")).toBe(1);
    expect(compareVersions("1.2.3", "1.2.4")).toBe(-1);
  });

  test("defaults to 0.0.0", () => {
    expect(compareVersions()).toBe(0);
    expect(compareVersions("1.0.0")).toBe(1);
  });
});

describe("parseRange", () => {
  test("exact version", () => {
    let r = parseRange("1.2.3");
    expect(r).toEqual({ type: "exact", major: 1, minor: 2, patch: 3 });
  });

  test("caret range", () => {
    let r = parseRange("^1.2.3");
    expect(r).toEqual({ type: "caret", major: 1, minor: 2, patch: 3 });
  });

  test("tilde range", () => {
    let r = parseRange("~1.2.3");
    expect(r).toEqual({ type: "tilde", major: 1, minor: 2, patch: 3 });
  });

  test("pre-1.0 caret", () => {
    let r = parseRange("^0.2.3");
    expect(r).toEqual({ type: "caret", major: 0, minor: 2, patch: 3 });
  });
});

describe("isRange", () => {
  test("caret is range", () => expect(isRange("^1.0.0")).toBe(true));
  test("tilde is range", () => expect(isRange("~1.0.0")).toBe(true));
  test("exact is not range", () => expect(isRange("1.0.0")).toBe(false));
});

describe("stripRangePrefix", () => {
  test("strips caret", () => expect(stripRangePrefix("^1.0.0")).toBe("1.0.0"));
  test("strips tilde", () => expect(stripRangePrefix("~1.0.0")).toBe("1.0.0"));
  test("keeps exact", () => expect(stripRangePrefix("1.0.0")).toBe("1.0.0"));
});

describe("upperBound", () => {
  test("caret ^1.2.3 → <2.0.0", () => {
    expect(upperBound(parseRange("^1.2.3"))).toEqual([2, 0, 0]);
  });

  test("caret ^0.2.3 → <0.3.0 (pre-1.0)", () => {
    expect(upperBound(parseRange("^0.2.3"))).toEqual([0, 3, 0]);
  });

  test("caret ^0.0.3 → <0.0.4 (pre-0.1)", () => {
    expect(upperBound(parseRange("^0.0.3"))).toEqual([0, 0, 4]);
  });

  test("tilde ~1.2.3 → <1.3.0", () => {
    expect(upperBound(parseRange("~1.2.3"))).toEqual([1, 3, 0]);
  });

  test("tilde ~0.2.3 → <0.3.0", () => {
    expect(upperBound(parseRange("~0.2.3"))).toEqual([0, 3, 0]);
  });

  test("exact 1.2.3 → <1.2.4", () => {
    expect(upperBound(parseRange("1.2.3"))).toEqual([1, 2, 4]);
  });
});

describe("satisfies", () => {
  describe("caret (^)", () => {
    let range = parseRange("^1.2.3");

    test("exact match", () => expect(satisfies("1.2.3", range)).toBe(true));
    test("higher patch", () => expect(satisfies("1.2.5", range)).toBe(true));
    test("higher minor", () => expect(satisfies("1.5.0", range)).toBe(true));
    test("highest before next major", () =>
      expect(satisfies("1.99.99", range)).toBe(true));
    test("next major", () => expect(satisfies("2.0.0", range)).toBe(false));
    test("lower patch", () => expect(satisfies("1.2.2", range)).toBe(false));
    test("lower minor", () => expect(satisfies("1.1.0", range)).toBe(false));
    test("lower major", () => expect(satisfies("0.9.0", range)).toBe(false));
  });

  describe("caret pre-1.0 (^0.x)", () => {
    let range = parseRange("^0.2.3");

    test("exact match", () => expect(satisfies("0.2.3", range)).toBe(true));
    test("higher patch", () => expect(satisfies("0.2.9", range)).toBe(true));
    test("next minor", () => expect(satisfies("0.3.0", range)).toBe(false));
    test("lower patch", () => expect(satisfies("0.2.2", range)).toBe(false));
  });

  describe("caret pre-0.1 (^0.0.x)", () => {
    let range = parseRange("^0.0.3");

    test("exact match", () => expect(satisfies("0.0.3", range)).toBe(true));
    test("next patch", () => expect(satisfies("0.0.4", range)).toBe(false));
    test("lower patch", () => expect(satisfies("0.0.2", range)).toBe(false));
  });

  describe("tilde (~)", () => {
    let range = parseRange("~1.2.3");

    test("exact match", () => expect(satisfies("1.2.3", range)).toBe(true));
    test("higher patch", () => expect(satisfies("1.2.9", range)).toBe(true));
    test("next minor", () => expect(satisfies("1.3.0", range)).toBe(false));
    test("lower patch", () => expect(satisfies("1.2.2", range)).toBe(false));
  });

  describe("exact", () => {
    let range = parseRange("1.2.3");

    test("exact match", () => expect(satisfies("1.2.3", range)).toBe(true));
    test("higher patch", () => expect(satisfies("1.2.4", range)).toBe(false));
    test("lower patch", () => expect(satisfies("1.2.2", range)).toBe(false));
  });
});

describe("highestSatisfying", () => {
  let versions = [
    "0.9.0",
    "1.0.0",
    "1.1.0",
    "1.2.0",
    "1.2.3",
    "1.5.0",
    "1.99.0",
    "2.0.0",
    "2.1.0",
  ];

  test("caret finds highest within major", () => {
    expect(highestSatisfying(versions, parseRange("^1.2.0"))).toBe("1.99.0");
  });

  test("tilde finds highest within minor", () => {
    expect(highestSatisfying(versions, parseRange("~1.2.0"))).toBe("1.2.3");
  });

  test("exact finds exact match", () => {
    expect(highestSatisfying(versions, parseRange("1.2.3"))).toBe("1.2.3");
  });

  test("returns undefined when no match", () => {
    expect(highestSatisfying(versions, parseRange("^3.0.0"))).toBeUndefined();
  });

  test("pre-1.0 caret respects minor boundary", () => {
    let pre1 = ["0.1.0", "0.2.0", "0.2.5", "0.3.0"];
    expect(highestSatisfying(pre1, parseRange("^0.2.0"))).toBe("0.2.5");
  });
});

describe("formatRange", () => {
  test("formats caret", () => {
    expect(formatRange({ type: "caret", major: 1, minor: 2, patch: 3 })).toBe(
      "^1.2.3",
    );
  });

  test("formats tilde", () => {
    expect(formatRange({ type: "tilde", major: 1, minor: 2, patch: 3 })).toBe(
      "~1.2.3",
    );
  });

  test("formats exact", () => {
    expect(formatRange({ type: "exact", major: 1, minor: 2, patch: 3 })).toBe(
      "1.2.3",
    );
  });
});
