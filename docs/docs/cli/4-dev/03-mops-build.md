---
slug: /cli/mops-build
sidebar_label: mops build
---

# `mops build`

Build Motoko canisters defined in `mops.toml`

```
mops build
```

Compiles Motoko canisters to WebAssembly (Wasm) modules and generates Candid interface and Motoko stable types files.

Canisters must be defined in the `[canisters]` section of your `mops.toml` file.

The build command will automatically:
- Add Candid metadata to the Wasm modules
- Generate a Motoko stable types file (`.most`) for each canister
- Validate Candid compatibility (if a candid file is specified in canister config)

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
```

### `[build].outputDir`

Custom output directory for compiled Wasm, Candid, and stable types files. The path is relative to the `mops.toml` location.

Default `.mops/.build`

The `--output` CLI flag takes precedence over this config value.

## Candid Compatibility

If a `candid` field is specified in the canister configuration, the build command will automatically check that the generated Candid interface is compatible with the specified interface.

If the compatibility check fails, the build will fail with an error message.

For manual compatibility checking, see [`mops check-candid`](/cli/mops-check-candid).

## Stable Types

Each build produces a `<canister>.most` file in the output directory alongside the `.wasm` and `.did` files. This file contains the stable variable type signatures and can be used to verify upgrade safety before deploying a new version.

```
mops check-stable .mops/.build/backend.most
```

See [`mops check-stable`](/cli/mops-check-stable) for details.
