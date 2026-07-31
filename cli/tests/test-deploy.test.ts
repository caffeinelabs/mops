import { describe, expect, test } from "@jest/globals";
import {
  ICP_ERROR_CODE_NUMBERS,
  mapPocketIcError,
} from "../helpers/ic-error-codes";

describe("mapPocketIcError", () => {
  test.each([
    ["SubnetOversubscribed", "IC0101"],
    ["CanisterOutOfCycles", "IC0207"],
    ["CanisterNotFound", "IC0301"],
    ["InvalidSubnetAdmin", "IC0410"],
    ["CanisterTrapped", "IC0502"],
    ["CanisterInvalidWasm", "IC0505"],
    ["CanisterWasmMemoryLimitExceeded", "IC0539"],
    ["CanisterStatusAccessDenied", "IC0542"],
    ["ResponseDropped", "IC0602"],
  ])("maps %s to %s", (pocketIcCode, icCode) => {
    const error = mapPocketIcError(
      new Error(`Rejected. Error code: ${pocketIcCode}. Certified: true`),
    );

    expect(error.message).toContain(`Error code: ${icCode} (${pocketIcCode})`);
  });

  test("contains unique, ordered three-digit codes", () => {
    const codes = Object.values(ICP_ERROR_CODE_NUMBERS);

    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => code >= 100 && code <= 999)).toBe(true);
    expect(codes).toEqual([...codes].sort((a, b) => a - b));
  });

  test("preserves unknown PocketIC error codes", () => {
    const original = new Error("Rejected. Error code: UnknownCode");

    expect(mapPocketIcError(original)).toBe(original);
  });
});
