---
slug: /cli/mops-generate
sidebar_label: mops generate
---

# `mops generate`

Generate source-derived artifacts from your Motoko code.

## `mops generate candid`

```
mops generate candid [canisters...]
```

(Re)generate the curated `.did` Candid interface file for one or more canisters from the current Motoko source.

The committed `.did` is what `mops build` subtype-checks against and embeds into the canister wasm, and what tools like [`@icp-sdk/bindgen`](https://www.npmjs.com/package/@icp-sdk/bindgen) read to generate frontend bindings. Refresh it whenever the Motoko interface changes; commit alongside the source change.

Canister selection mirrors `mops build`: with no arguments, all canisters in `[canisters]` are processed; otherwise only the named ones (unknown names error).

### Where the file is written

Resolved in this order:

1. `--output <path>` if given (single-canister only) — writes there and does **not** touch `mops.toml`.
2. `[canisters.<name>].candid` if set — overwrites that file in place; no config changes.
3. Default — `<name>.did` in the directory containing `main`, e.g. `main = "src/Backend.mo"` → `src/backend.did`. The path is also written to `[canisters.<name>].candid` in `mops.toml` so subsequent runs reuse it.

Paths inside `.mops/` are rejected — `.mops/` is a private build cache; the generated file should be committable and readable by downstream tooling.

### Examples

Generate for all canisters
```
mops generate candid
```

Generate for one canister
```
mops generate candid backend
```

One-off generation to an arbitrary path (does not modify `mops.toml`)
```
mops generate candid backend -o build/backend.did
```

## Options

### `--output`, `-o`

Write the generated `.did` to the given path. Single-canister only. Does not update `mops.toml`. Use for ad-hoc generation to a non-tracked location; the normal flow uses `[canisters.<name>].candid` (or the default location).

### `--verbose`

Show the `moc` invocation.

## How it works

`mops generate candid` invokes `moc --idl` with the same packages, `[moc].args`, `[build].args`, per-canister `args`, and migration flags as `mops build` — keeping the generated interface in lockstep with what `mops build` would produce. No `.wasm` or `.most` files are emitted; the deployed canister's metadata is unaffected.

When `moc` fails, neither the destination file nor `mops.toml` is touched.

## Relation to `mops build`

`mops build` subtype-checks the auto-generated interface against `[canisters.<name>].candid` (when set) and embeds the curated file as `candid:service` metadata. Use `mops generate candid` to keep that curated file in sync with source. The two commands share moc invocation logic so the generated `.did` always passes the build's compatibility check.
