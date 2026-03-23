import * as wasm from "../../wasm/pkg/web/wasm.js";
import { setWasmBindings } from "../../wasm.js";

setWasmBindings(wasm);

export * from "../../cli.js";
