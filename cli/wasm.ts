export interface FunctionComplexity {
  index: number;
  name?: string;
  complexity: number;
  instructionCount: number;
  breakdown: ComplexityBreakdown;
}

export interface ComplexityContribution {
  instructionCount: number;
  complexity: number;
}

export interface ComplexityBreakdown {
  calls: ComplexityContribution;
  branches: ComplexityContribution;
  controlFlow: ComplexityContribution;
  memory: ComplexityContribution;
  variableAccess: ComplexityContribution;
  numeric: ComplexityContribution;
  tableAndReferences: ComplexityContribution;
  other: ComplexityContribution;
}

export interface WasmComplexityAnalysis {
  riskyFunctions: FunctionComplexity[];
}

export interface WasmBindings {
  /** Why `newCandid` is not a subtype of `originalCandid`; `undefined` when it is. */
  check_candid_compatibility: (
    newCandid: string,
    originalCandid: string,
  ) => string | undefined;
  encode_candid_args: (args: string, candidInterface: string) => Uint8Array;
  analyze_wasm_function_complexity: (
    bytes: Uint8Array,
    threshold: number,
  ) => WasmComplexityAnalysis;
}

let bindings: WasmBindings | undefined;

export function setWasmBindings(newBindings: WasmBindings) {
  bindings = newBindings;
}

export function getWasmBindings(): WasmBindings {
  if (!bindings) {
    throw new Error("Wasm bindings have not been set");
  }
  return bindings;
}
