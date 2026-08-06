export interface CustomSection {
  name: string;
  data: string;
}

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
  maxComplexity: number;
  riskyFunctions: FunctionComplexity[];
}

export interface WasmBindings {
  is_candid_compatible: (newCandid: string, originalCandid: string) => boolean;
  encode_candid_args: (args: string, candidInterface: string) => Uint8Array;
  add_custom_sections: (
    bytes: Uint8Array,
    customSections: CustomSection[],
  ) => Uint8Array;
  analyze_wasm_function_complexity: (
    bytes: Uint8Array,
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
