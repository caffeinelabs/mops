import { describe, expect, test } from "@jest/globals";
import { validateCanisterConfig } from "../helpers/resolve-canisters";

describe("validateCanisterConfig", () => {
  test.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid wasmMemoryLimit %s",
    (wasmMemoryLimit) => {
      expect(() =>
        validateCanisterConfig("backend", { wasmMemoryLimit }),
      ).toThrow(
        "Invalid wasmMemoryLimit for canister backend: expected a positive integer number of bytes",
      );
    },
  );

  test("accepts a positive integer wasmMemoryLimit", () => {
    expect(() =>
      validateCanisterConfig("backend", { wasmMemoryLimit: 16_777_216 }),
    ).not.toThrow();
  });
});
