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

When [`[optimize]`](../../09-mops.toml.md#optimize) is set in `mops.toml`, mops runs Binaryen `wasm-opt` on the Wasm **after** candid metadata is embedded. Defaults are `-O3 -g` (see the config reference). Requires a `[toolchain] wasm-opt` pin, and a `wasm-opt` failure fails the build. Pass [`--no-optimize`](#--no-optimize) to skip this pass for a single run.

When `--check-wasm` or `[build].check-wasm = true` enables static validation, Mops uses Walrus to estimate each function's IC0505 compilation complexity in the final Wasm:

- Below 750,000: no warning
- 750,000 through 899,999: early warning
- 900,000 and above: critical warning

Warnings use stable `MOPS-WASM-COMPLEXITY` messages with the canister, function index, optional Wasm name, estimated complexity, limit usage, instruction count, and suggested Motoko correction. They also report the three largest complexity contributors, such as calls, branches, control-flow blocks, memory operations, or variable access, so generated Motoko can target the next correction. The estimate never fails the build or skips deployment. PocketIC remains authoritative for IC0505 and IC0539 validation.

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

Analyze each final Wasm for complexity risks
```
mops build --check-wasm
```

Build and verify that each Wasm installs on PocketIC
```
mops build --check-deploy
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

Skip the [`[optimize]`](../../09-mops.toml.md#optimize) `wasm-opt` post-pass for this run, even when it is configured in `mops.toml`. Has no effect when `[optimize]` is not set. Useful for a faster build or to produce an unoptimized module for debugging without editing `mops.toml`.

```
mops build --no-optimize
```

### `--locked`

Require an up-to-date [`mops.lock`](../../10-mops.lock.md) and never write it — fails if the lockfile is missing or no longer matches `mops.toml` and the registry. Intended for CI, so that a job can run this command without a preceding `mops install`. See [`mops install --locked`](../1-deps/02-mops-install.md#--locked).

### `--check-wasm`

Analyze each final Wasm for likely IC0505 function-complexity risks without starting PocketIC. This check emits actionable warnings and never fails the build.

Enable the same analysis for every plain `mops build` invocation:
```toml
[build]
check-wasm = true
```

### `--no-check-wasm`

Skip static Wasm analysis for this build, even when
`[build].check-wasm = true`.

```bash
mops build --no-check-wasm
```

### `--check-deploy`

Install each built Wasm on a fresh PocketIC canister after compilation, metadata embedding, and optimization. The build fails if PocketIC rejects the Wasm or the canister initialization traps. Initialization uses the canister's configured `initArg`, or `()` when it is omitted.

Enable the same validation for every plain `mops build` invocation:
```toml
[build]
check-deploy = true
```

Requires a `[toolchain] pocket-ic` pin — with no pin the build fails and names
`mops toolchain use pocket-ic 15.0.0`. Set
[`MOPS_POCKET_IC_URL`](../7-misc/06-environment-variables.md#mops_pocket_ic_url)
to use an already-running PocketIC server instead; the pin is then ignored.
```toml
[toolchain]
pocket-ic = "15.0.0"
```

To check deployment with a non-default Wasm memory limit, configure the limit in
bytes on the canister:
```toml
[canisters.backend]
main = "src/backend/main.mo"
wasmMemoryLimit = 16777216
```

The PocketIC client and binary are only loaded when `--check-deploy` or
`[build].check-deploy` enables this validation.
PocketIC errors are reported as provided by the client.

Before installation, Mops writes a temporary empty-actor `.most` and asks the
configured `moc` to run `--stable-compatible` against each generated `.most`.
If moc reports that a canister cannot reach its built stable state from an
empty canister, Mops reports `MOPS-CHECK-DEPLOY-SKIPPED` with the compiler
diagnostic and does not run that deployment check. Other canisters are still
checked. Validate the skipped upgrade against representative baseline state.

### `--no-check-deploy`

Skip PocketIC deployment validation for this build, even when
`[build].check-deploy = true`.

```bash
mops build --no-check-deploy
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
- `wasmMemoryLimit` - Wasm memory limit in bytes applied by [`--check-deploy`](#--check-deploy) (optional)
- `[canisters.<name>.migrations]` and `[canisters.<name>.check-stable]` subtables — see the [`mops.toml` reference](../../09-mops.toml.md#canisters)

You can also set global build settings:
```toml
[build]
outputDir = "dist"
args = ["--release", "--ai-errors"]
check-wasm = true
check-deploy = true
```

### `[build].outputDir`

Custom output directory for compiled Wasm, Candid, and stable types files. The path is relative to the `mops.toml` location.

Default `.mops/.build`

The `--output` CLI flag takes precedence over this config value.

## Enhanced Migration Support

When a canister has a `[canisters.<name>.migrations]` section in `mops.toml`, `mops build` automatically injects the `--enhanced-migration` flag. The full migration chain is compiled into the WASM.

If `mops check` passes but `mops build` fails while [`check-limit`](./08-mops-migrate.md#chain-trimming) is set, re-run `mops check --no-check-limit` to surface the issue — `check` trims the chain, while `build` compiles all of it.

## Candid Compatibility

If a `candid` field is specified in the canister configuration, the build command will automatically check that the generated Candid interface is compatible with the specified interface.

If the compatibility check fails, the build will fail with an error message.

For manual compatibility checking, see [`mops check-candid`](./06-mops-check-candid.md).

## Stable Types

Each build produces a `<canister>.most` file in the output directory alongside the `.wasm` and `.did` files. This file captures the stable variable type signatures of the current canister version.

To use it for upgrade safety checking, save the `.most` file before deploying a new version (e.g. copy it to a committed path), then point `mops check` to it via `mops.toml`:

```toml
[canisters.backend.check-stable]
path = ".deployed/backend.most"
```

With this in place, `mops check` automatically verifies upgrade compatibility on every run.

See [`mops check`](./04-mops-check.md#stable-compatibility-checking) for full configuration details.
