import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setWasmBindings } from "../../wasm.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const wasm = require(path.join(__dirname, "../../wasm/pkg/nodejs/wasm.js"));

setWasmBindings(wasm);

export * from "../../cli.js";
