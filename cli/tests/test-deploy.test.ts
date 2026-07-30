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

  test("matches the authoritative ic-error-types numeric sequence", () => {
    expect(Object.values(ICP_ERROR_CODE_NUMBERS)).toEqual([
      101, 102, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 301, 305, 402,
      403, 404, 405, 406, 407, 408, 409, 410, 502, 503, 504, 505, 506, 507, 508,
      509, 510, 511, 512, 513, 514, 517, 520, 521, 522, 524, 525, 526, 527, 528,
      529, 530, 531, 532, 533, 534, 535, 536, 537, 538, 539, 540, 541, 542, 601,
      602,
    ]);
  });

  test("preserves unknown PocketIC error codes", () => {
    const original = new Error("Rejected. Error code: UnknownCode");

    expect(mapPocketIcError(original)).toBe(original);
  });
});
