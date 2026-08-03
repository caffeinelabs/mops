// Entry for the pre-bundled `@dfinity/pic` (see the `vendor:pic` script).
// `@dfinity/pic` ships CommonJS, so `export *` yields no named exports through
// esbuild — the runtime bindings mops needs are re-exported explicitly.
import pic from "@dfinity/pic";

export const PocketIc = pic.PocketIc;
export const PocketIcServer = pic.PocketIcServer;
