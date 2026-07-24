import { describe, expect, test } from "@jest/globals";
import { normalizeBinaryenVersion } from "../helpers/binaryen-version";
import type { Config } from "../types";
import {
  formatOptimizePipeline,
  isOptimizeEnabled,
  resolveOptimizeConfig,
} from "../helpers/optimize-config";

describe("optimize-config", () => {
  test("isOptimizeEnabled: absent vs empty table", () => {
    expect(isOptimizeEnabled({} as Config)).toBe(false);
    expect(isOptimizeEnabled({ optimize: {} } as Config)).toBe(true);
    expect(isOptimizeEnabled({ optimize: false } as unknown as Config)).toBe(
      false,
    );
    expect(isOptimizeEnabled({ optimize: true } as unknown as Config)).toBe(
      false,
    );
  });

  test("resolveOptimizeConfig defaults", () => {
    expect(resolveOptimizeConfig({ optimize: {} } as Config)).toEqual({
      level: "O3",
      keepNames: true,
      args: [],
    });
  });

  test("resolveOptimizeConfig overrides", () => {
    expect(
      resolveOptimizeConfig({
        optimize: {
          level: "Oz",
          "keep-names": false,
          args: ["--enable-bulk-memory"],
        },
      } as Config),
    ).toEqual({
      level: "Oz",
      keepNames: false,
      args: ["--enable-bulk-memory"],
    });
  });

  test("formatOptimizePipeline", () => {
    expect(formatOptimizePipeline({} as Config)).toBe("none (raw moc output)");
    expect(
      formatOptimizePipeline({
        optimize: {},
        toolchain: { "wasm-opt": "131" },
      } as Config),
    ).toBe("wasm-opt 131 -O3 -g");
    expect(
      formatOptimizePipeline({
        optimize: { level: "Oz", "keep-names": false },
        toolchain: { "wasm-opt": "131" },
      } as Config),
    ).toBe("wasm-opt 131 -Oz");
  });

  test("formatOptimizePipeline: --no-optimize overrides an enabled config", () => {
    expect(
      formatOptimizePipeline(
        { optimize: {}, toolchain: { "wasm-opt": "131" } } as Config,
        { optimize: false },
      ),
    ).toBe("none (--no-optimize)");
  });

  test("normalizeBinaryenVersion", () => {
    expect(normalizeBinaryenVersion("version_131")).toBe("131");
    expect(normalizeBinaryenVersion("ersion_131")).toBe("131");
    expect(normalizeBinaryenVersion("131")).toBe("131");
  });
});
