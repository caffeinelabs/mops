// Entry for the pre-bundled `@dfinity/pic` (see the `vendor:pic` script).
// `@dfinity/pic` ships CommonJS, so `export *` yields no named exports through
// esbuild — the runtime bindings mops needs are re-exported explicitly.
//
// `@icp-sdk/core` is left external: mops depends on the same major, so the
// bundle resolves it from node_modules instead of carrying a second copy.
// Sharing one copy is also what lets `idlFactory` and `Principal` cross the
// boundary without structurally-identical-but-unrelated type errors.
import pic from "@dfinity/pic";

export const PocketIc = pic.PocketIc;
export const PocketIcServer = pic.PocketIcServer;
