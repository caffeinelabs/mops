export interface CustomSection {
  name: string;
  data: string;
}

export interface WasmBindings {
  is_candid_compatible: (newCandid: string, originalCandid: string) => boolean;
  add_custom_sections: (
    bytes: Uint8Array,
    customSections: CustomSection[],
  ) => Uint8Array;
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
