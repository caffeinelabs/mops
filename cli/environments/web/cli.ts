import * as wasm from "../../wasm/pkg/web/wasm.js";
import { setWasmBindings } from "../../wasm.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Web wasm-pack target requires explicit initialization (unlike the nodejs
// target which auto-inits on require). Load the CLI's own WASM binary and
// call initSync before exposing the bindings.
// In the bundle __dirname is defined as import.meta.dirname and the binary
// sits next to cli.js; bundle:fix rewrites the path accordingly.
const wasmBytes = readFileSync(
  resolve(__dirname, "../../wasm/pkg/web/wasm_bg.wasm"),
);
wasm.initSync({ module: wasmBytes });

setWasmBindings(wasm);

export * from "../../cli.js";
