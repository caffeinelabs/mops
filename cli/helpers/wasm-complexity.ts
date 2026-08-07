import chalk from "chalk";
import {
  getWasmBindings,
  type ComplexityBreakdown,
  type FunctionComplexity,
  type WasmComplexityAnalysis,
} from "../wasm.js";

const DISPLAYED_FUNCTION_LIMIT = 3;
export const IC_FUNCTION_COMPLEXITY_LIMIT = 1_000_000;
export const EARLY_COMPLEXITY_THRESHOLD = 750_000;
export const CRITICAL_COMPLEXITY_THRESHOLD = 900_000;
const numberFormat = new Intl.NumberFormat("en-US");

export type ComplexitySeverity = "none" | "early" | "critical";

export interface WasmPreflightDiagnostic {
  message: string;
}

export interface WasmPreflightReport {
  diagnostics: WasmPreflightDiagnostic[];
}

export function classifyComplexity(complexity: number): ComplexitySeverity {
  if (complexity >= CRITICAL_COMPLEXITY_THRESHOLD) {
    return "critical";
  }
  if (complexity >= EARLY_COMPLEXITY_THRESHOLD) {
    return "early";
  }
  return "none";
}

export function formatWasmPreflightReport(
  canisterName: string,
  analysis: WasmComplexityAnalysis,
): WasmPreflightReport {
  const diagnostics: WasmPreflightDiagnostic[] = [];

  const riskyFunctions = [...analysis.riskyFunctions]
    .filter((func) => classifyComplexity(func.complexity) !== "none")
    .sort((a, b) => b.complexity - a.complexity || a.index - b.index)
    .slice(0, DISPLAYED_FUNCTION_LIMIT);

  for (const func of riskyFunctions) {
    const severity = classifyComplexity(func.complexity);
    if (severity === "none") {
      continue;
    }
    const message = formatComplexityMessage(canisterName, func, severity);
    diagnostics.push({ message });
  }

  return { diagnostics };
}

export function runWasmComplexityPreflight(
  canisterName: string,
  wasm: Uint8Array,
): WasmPreflightReport {
  try {
    const analysis = getWasmBindings().analyze_wasm_function_complexity(wasm);
    const report = formatWasmPreflightReport(canisterName, analysis);
    for (const diagnostic of report.diagnostics) {
      console.warn(chalk.yellow(diagnostic.message));
    }
    return report;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      chalk.yellow(
        `Warning: unable to run Wasm complexity preflight for canister ${canisterName}: ${message}`,
      ),
    );
    return { diagnostics: [] };
  }
}

function formatComplexityMessage(
  canisterName: string,
  func: FunctionComplexity,
  severity: Exclude<ComplexitySeverity, "none">,
): string {
  const exceedsLimit = func.complexity > IC_FUNCTION_COMPLEXITY_LIMIT;
  const name = func.name ? ` (${func.name})` : "";
  return [
    "Warning [MOPS-WASM-COMPLEXITY]:",
    `Severity: ${capitalize(severity)}`,
    `Canister: ${canisterName}`,
    `Function: ${numberFormat.format(func.index)}${name}`,
    `Estimated complexity: ${numberFormat.format(func.complexity)}`,
    `IC0505 limit: ${numberFormat.format(IC_FUNCTION_COMPLEXITY_LIMIT)}`,
    `Limit usage: ${formatPercentage(func.complexity)}`,
    `Instruction count: ${numberFormat.format(func.instructionCount)}`,
    ...formatPrimaryContributors(func),
    ...(exceedsLimit
      ? [
          "Result: This estimate exceeds the IC0505 limit. PocketIC deployment check will verify the authoritative result.",
          "Suggested correction: Split this Motoko function into smaller independently compiled functions, reduce generated statements or branches, then rebuild.",
        ]
      : [
          "Suggested correction: Refactor the generated Motoko before adding more code. Split large straight-line logic, generated call sequences, or branch chains into smaller helper functions.",
        ]),
  ].join("\n");
}

function formatPrimaryContributors(func: FunctionComplexity): string[] {
  const labels: Record<keyof ComplexityBreakdown, string> = {
    calls: "Calls",
    branches: "Branches",
    controlFlow: "Blocks/loops/conditionals",
    memory: "Memory operations",
    variableAccess: "Variable access",
    numeric: "Numeric operations",
    tableAndReferences: "Table/reference operations",
    other: "Other instructions",
  };
  const contributors = (
    Object.entries(func.breakdown) as [
      keyof ComplexityBreakdown,
      ComplexityBreakdown[keyof ComplexityBreakdown],
    ][]
  )
    .filter(([, contribution]) => contribution.complexity > 0)
    .sort(
      ([leftKey, left], [rightKey, right]) =>
        right.complexity - left.complexity ||
        right.instructionCount - left.instructionCount ||
        labels[leftKey].localeCompare(labels[rightKey]),
    )
    .slice(0, 3);

  if (!contributors.length) {
    return [];
  }
  return [
    "Primary contributors:",
    ...contributors.map(
      ([key, contribution]) =>
        `${labels[key]}: ${numberFormat.format(contribution.instructionCount)} instructions, ${numberFormat.format(contribution.complexity)} complexity`,
    ),
  ];
}

function formatPercentage(complexity: number): string {
  return `${((complexity / IC_FUNCTION_COMPLEXITY_LIMIT) * 100).toFixed(1)}%`;
}

function capitalize(value: string): string {
  return `${value[0]?.toUpperCase()}${value.slice(1)}`;
}
