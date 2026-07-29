import { getWasmBindings } from "../wasm.js";

export function bindMotoko(did: string): string {
  return getWasmBindings().bind_motoko(did);
}
