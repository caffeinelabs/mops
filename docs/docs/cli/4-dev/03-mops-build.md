---
slug: /cli/mops-build
sidebar_label: mops build
---

# `mops build`

Build Motoko canisters defined in `mops.toml`

```
mops build
```

Compiles Motoko canisters to WebAssembly and generates their Candid interface and stable types files.

Canisters must be defined in the `[canisters]` section of your `mops.toml` file.

For each canister, three files are written to the output directory (default `.mops/.build`):

- `<canister>.wasm` — compiled WebAssembly module, with Candid metadata embedded
- `<canister>.did` — generated Candid interface
- `<canister>.most` — Motoko stable types signature (used for upgrade safety checking)

If the canister config sets a `candid` field, the generated `.did` is also checked for compatibility against it.

When [`[optimize]`](/mops.toml#optimize) is set in `mops.toml`, mops runs Binaryen `wasm-opt` on the Wasm **after** candid metadata is embedded. Defaults are `-O3 -g` (see the config reference). Failures warn and leave the unoptimized module. Pass [`--no-optimize`](#--no-optimize) to skip this pass for a single run.

### Examples

Build all canisters defined in `mops.toml`
```
mops build
```

Build specific canisters
```
mops build backend frontend
```

Build with verbose output
```
mops build --verbose
```

Build with custom output directory
```
mops build --output ./build
```

Build and verify that each Wasm installs on PocketIC
```
mops build --test-deploy
```

Pass additional arguments to the Motoko compiler
```
mops build -- --release --ai-errors
```

## Options

### `--verbose`

Show detailed build information including compiler commands and build times.

### `--output`, `-o`

Specify the output directory for compiled Wasm, Candid, and stable types files. Overrides `[build].outputDir` from `mops.toml`.

Default `.mops/.build`

```
mops build --output ./dist
```

### `--no-optimize`

Skip the [`[optimize]`](/mops.toml#optimize) `wasm-opt` post-pass for this run, even when it is configured in `mops.toml`. Has no effect when `[optimize]` is not set. Useful for a faster build or to produce an unoptimized module for debugging without editing `mops.toml`.

```
mops build --no-optimize
```

### `--test-deploy`

Install each built Wasm on a fresh PocketIC canister after compilation, metadata embedding, and optimization. The build fails if PocketIC rejects the Wasm or the canister initialization traps. Initialization uses the canister's configured `initArg`, or `()` when it is omitted.

Enable the same validation for every plain `mops build` invocation:
```toml
[build]
test-deploy = true
```

PocketIC 9.0.0 or newer, or a local PocketIC binary path, must be pinned in
`[toolchain]`. Mops cannot verify compatibility for a path pin.
```toml
[toolchain]
pocket-ic = "12.0.0"
```

To test deployment with a non-default Wasm memory limit, configure the limit in
bytes on the canister:
```toml
[canisters.backend]
main = "src/backend/main.mo"
wasmMemoryLimit = 16777216
```

The PocketIC client and binary are only loaded when `--test-deploy` or
`[build].test-deploy` enables this validation.
PocketIC error names are reported with their canonical IC error codes,
for example `IC0539 (CanisterWasmMemoryLimitExceeded)`.

This validation performs a fresh install. If the generated `.most` shows that
an enhanced migration chain starts from pre-existing state instead of `{}`,
Mops skips that canister with a warning because no baseline Wasm is available.
Other canisters are still tested normally.

### `--no-test-deploy`

Skip PocketIC deployment validation for this build, even when
`[build].test-deploy = true`.

```bash
mops build --no-test-deploy
```

## Configuration

Canisters are defined in your `mops.toml` file:

```toml
[canisters.backend]
main = "src/main.mo"
args = []
```

Each canister configuration supports:
- `main` - Path to the main Motoko file (required)
- `args` - Additional compiler arguments for this specific canister (optional)
- `initArg` - Candid-encoded initialization arguments (optional)
- `candid` - Path to the Candid interface file (optional, for compatibility checking)

You can also set global build settings:
```toml
[build]
outputDir = "dist"
args = ["--release", "--ai-errors"]
test-deploy = true
```

### `[build].outputDir`

Custom output directory for compiled Wasm, Candid, and stable types files. The path is relative to the `mops.toml` location.

Default `.mops/.build`

The `--output` CLI flag takes precedence over this config value.

## Enhanced Migration Support

When a canister has a `[canisters.<name>.migrations]` section in `mops.toml`, `mops build` automatically injects the `--enhanced-migration` flag. The full migration chain is compiled into the WASM.

If `mops check` passes but `mops build` fails while [`check-limit`](/cli/mops-migrate#chain-trimming) is set, re-run `mops check --no-check-limit` to surface the issue — `check` trims the chain, while `build` compiles all of it.

## Candid Compatibility

If a `candid` field is specified in the canister configuration, the build command will automatically check that the generated Candid interface is compatible with the specified interface.

If the compatibility check fails, the build will fail with an error message.

For manual compatibility checking, see [`mops check-candid`](/cli/mops-check-candid).

## Stable Types

Each build produces a `<canister>.most` file in the output directory alongside the `.wasm` and `.did` files. This file captures the stable variable type signatures of the current canister version.

To use it for upgrade safety checking, save the `.most` file before deploying a new version (e.g. copy it to a committed path), then point `mops check` to it via `mops.toml`:

```toml
[canisters.backend.check-stable]
path = ".deployed/backend.most"
```

With this in place, `mops check` automatically verifies upgrade compatibility on every run.

See [`mops check`](/cli/mops-check#stable-compatibility-checking) for full configuration details.
