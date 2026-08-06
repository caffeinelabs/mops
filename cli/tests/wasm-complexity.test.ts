import { describe, expect, test } from "@jest/globals";
import {
  classifyComplexity,
  classifySizeRisk,
  formatWasmPreflightReport,
  type ComplexitySeverity,
  type SizeSeverity,
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
    totalFunctions: 100,
    localFunctions: 90,
    importedFunctions: 10,
    locals: 500,
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
    [1_000_001, "fatal"],
  ])("classifies %i as %s", (complexity, expected) => {
    expect(classifyComplexity(complexity)).toBe(expected);
  });

  test("fatal report contains structured fields and correction guidance", () => {
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

    expect(report.fatal).toBe(true);
    expect(report.diagnostics).toHaveLength(1);
    expect(report.diagnostics[0]?.level).toBe("error");
    const output = report.diagnostics[0]?.message ?? "";
    expect(output).toContain(
      "Error [MOPS-WASM-COMPLEXITY]:\nSeverity: Fatal\nCanister: backend\nFunction: 42 (initialize_data)",
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
      "Build failed and PocketIC test deployment was skipped",
    );
    expect(output).toContain("Suggested correction: Split this Motoko");
  });

  test("critical warning remains nonfatal and actionable", () => {
    const report = formatWasmPreflightReport(
      "backend",
      analysis({ riskyFunctions: [func(925_000)] }),
    );

    expect(report.fatal).toBe(false);
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

describe("Wasm size thresholds", () => {
  test.each<[number, SizeSeverity]>([
    [649, "none"],
    [650, "early"],
    [673, "early"],
    [674, "strong"],
  ])("classifies %i total functions as %s", (totalFunctions, expected) => {
    expect(classifySizeRisk(totalFunctions, 0)).toBe(expected);
  });

  test.each<[number, SizeSeverity]>([
    [3_799, "none"],
    [3_800, "early"],
    [3_999, "early"],
    [4_000, "strong"],
  ])("classifies %i locals as %s", (locals, expected) => {
    expect(classifySizeRisk(0, locals)).toBe(expected);
  });

  test("count warning contains metrics and remains nonfatal", () => {
    const report = formatWasmPreflightReport(
      "backend",
      analysis({
        totalFunctions: 690,
        localFunctions: 660,
        importedFunctions: 30,
        locals: 4_120,
      }),
    );

    expect(report.fatal).toBe(false);
    expect(report.diagnostics).toHaveLength(1);
    expect(report.diagnostics[0]?.level).toBe("warning");
    const output = report.diagnostics[0]?.message ?? "";
    expect(output).toContain(
      "Warning [MOPS-WASM-SIZE]:\nSeverity: Strong\nCanister: backend",
    );
    expect(output).toContain("Generated Wasm functions: 690");
    expect(output).toContain("Local functions: 660");
    expect(output).toContain("Imported functions: 30");
    expect(output).toContain("Generated Wasm locals: 4,120");
    expect(output).toContain("do not prove a memory-limit failure");
    expect(output).toContain("Next step: Run PocketIC");
  });
});
