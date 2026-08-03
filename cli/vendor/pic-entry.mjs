// Entry for the pre-bundled `@dfinity/pic` (see the `vendor:pic` script).
// `@dfinity/pic` ships CommonJS, so `export *` yields no named exports through
// esbuild — the runtime bindings mops needs are re-exported explicitly.
//
// pic's own `@icp-sdk/core` (^5) is bundled in rather than left external, so it
// does not force mops onto 5.x. 5.x drops the IC HTTP API v2 endpoints that the
// dfx replica still serves, and mops uses `@icp-sdk/core` for the `dfx` and
// `dfx-pocket-ic` replicas. Nothing crosses the two copies: `idlFactory` takes
// pic's `IDL` as an argument, and the returned `canisterId` only goes back into
// pic or through `.toText()`.
import pic from "@dfinity/pic";

export const PocketIc = pic.PocketIc;
export const PocketIcServer = pic.PocketIcServer;
