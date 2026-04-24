import { describe, expect, test } from "@jest/globals";
import { isExperimentEnabled } from "../experimental";
import { Config } from "../types";

describe("isExperimentEnabled", () => {
  test("returns false when no [experimental] section", () => {
    expect(isExperimentEnabled({}, "any-flag")).toBe(false);
  });

  test("returns false when flags array is empty", () => {
    let config: Config = { experimental: { flags: [] } };
    expect(isExperimentEnabled(config, "any-flag")).toBe(false);
  });

  test("returns false when the flag is not listed", () => {
    let config: Config = { experimental: { flags: ["other-flag"] } };
    expect(isExperimentEnabled(config, "wanted-flag")).toBe(false);
  });

  test("returns true when the flag is listed", () => {
    let config: Config = { experimental: { flags: ["wanted-flag"] } };
    expect(isExperimentEnabled(config, "wanted-flag")).toBe(true);
  });
});
