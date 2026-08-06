import { describe, expect, test } from "@jest/globals";
import {
  classifyComplexity,
  formatWasmPreflightReport,
  type ComplexitySeverity,
} from "../helpers/wasm-complexity";
import type {
  ComplexityBreakdown,
  FunctionComplexity,
  WasmComplexityAnalysis,
} from "../wasm";

function breakdown(
  overrides: Partial<ComplexityBreakdown> = {},
): ComplexityBreakdown {
  const empty = { instructionCount: 0, complexity: 0 };
  return {
    calls: empty,
    branches: empty,
    controlFlow: empty,
    memory: empty,
    variableAccess: empty,
    numeric: empty,
    tableAndReferences: empty,
    other: empty,
    ...overrides,
  };
}

function func(
  complexity: number,
  index = 42,
  name?: string,
  complexityBreakdown: ComplexityBreakdown = breakdown(),
): FunctionComplexity {
  return {
    index,
    name,
    complexity,
    instructionCount: 27_500,
    breakdown: complexityBreakdown,
  };
}

function analysis(
  overrides: Partial<WasmComplexityAnalysis> = {},
): WasmComplexityAnalysis {
  return {
    maxComplexity: 0,
    riskyFunctions: [],
    ...overrides,
  };
}

describe("Wasm complexity thresholds", () => {
  test.each<[number, ComplexitySeverity]>([
    [749_999, "none"],
    [750_000, "early"],
    [900_000, "critical"],
    [1_000_000, "critical"],
    [1_000_001, "critical"],
  ])("classifies %i as %s", (complexity, expected) => {
    expect(classifyComplexity(complexity)).toBe(expected);
  });

  test("over-limit report warns and leaves PocketIC authoritative", () => {
    const report = formatWasmPreflightReport(
      "backend",
      analysis({
        maxComplexity: 1_120_000,
        riskyFunctions: [
          func(
            1_120_000,
            42,
            "initialize_data",
            breakdown({
              calls: { instructionCount: 12_400, complexity: 620_000 },
              branches: { instructionCount: 4_100, complexity: 205_000 },
              controlFlow: { instructionCount: 1_800, complexity: 90_000 },
              other: { instructionCount: 9_200, complexity: 205_000 },
            }),
          ),
        ],
      }),
    );

    expect(report.diagnostics).toHaveLength(1);
    const output = report.diagnostics[0]?.message ?? "";
    expect(output).toContain(
      "Warning [MOPS-WASM-COMPLEXITY]:\nSeverity: Critical\nCanister: backend\nFunction: 42 (initialize_data)",
    );
    expect(output).toContain("Estimated complexity: 1,120,000");
    expect(output).toContain("IC0505 limit: 1,000,000");
    expect(output).toContain("Limit usage: 112.0%");
    expect(output).toContain("Instruction count: 27,500");
    expect(output).toContain("Primary contributors:");
    expect(output).toContain("Calls: 12,400 instructions, 620,000 complexity");
    expect(output).toContain(
      "Branches: 4,100 instructions, 205,000 complexity",
    );
    expect(output).toContain(
      "Other instructions: 9,200 instructions, 205,000 complexity",
    );
    expect(output).not.toContain("Blocks/loops/conditionals:");
    expect(output).toContain(
      "PocketIC test deployment will verify the authoritative result",
    );
    expect(output).toContain("Suggested correction: Split this Motoko");
  });

  test("critical warning remains nonfatal and actionable", () => {
    const report = formatWasmPreflightReport(
      "backend",
      analysis({ riskyFunctions: [func(925_000)] }),
    );

    expect(report.diagnostics[0]?.message).toContain("Severity: Critical");
    expect(report.diagnostics[0]?.message).toContain("Limit usage: 92.5%");
    expect(report.diagnostics[0]?.message).toContain(
      "Split large straight-line logic, generated call sequences, or branch chains",
    );
  });

  test("sorts risky functions and limits output to the top three", () => {
    const report = formatWasmPreflightReport(
      "backend",
      analysis({
        riskyFunctions: [
          func(910_000, 4),
          func(1_200_000, 2),
          func(950_000, 3),
          func(1_100_000, 1),
        ],
      }),
    );
    const output = report.diagnostics.map(({ message }) => message).join("\n");

    expect(output.indexOf("Function: 2")).toBeLessThan(
      output.indexOf("Function: 1"),
    );
    expect(output.indexOf("Function: 1")).toBeLessThan(
      output.indexOf("Function: 3"),
    );
    expect(output).not.toContain("Function: 4");
  });
});
