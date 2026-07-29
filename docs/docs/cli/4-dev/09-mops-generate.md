---
slug: /cli/mops-generate
sidebar_label: mops generate
---

# `mops generate`

Generate project artifacts: curated Candid from Motoko, or Motoko bindings from Candid.

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

Pass additional arguments to the Motoko compiler
```
mops generate candid -- -Werror
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

## `mops generate bindings`

```
mops generate bindings [targets...]
```

Generate Motoko binding modules from committed `.did` interfaces. Use this when a canister talks to **many** principals sharing one interface (e.g. ICRC ledgers chosen at runtime via `actor(id) : ICRC.Self`). For a **single** fixed target, prefer `canister:` imports with `--actor-env-alias` instead.

The `.did` is the source of truth — commit it, regenerate after interface changes, and commit the generated `.mo` (or regenerate in CI). Codegen uses the same `candid_parser` Motoko bindgen as `didc bind -t mo`, embedded in mops (no separate `didc` install). Unlike `didc`, `.did` `import`s are rejected — flatten the interface first.

### Config

Declare interfaces under `[bindings.<name>]` in `mops.toml`:

```toml
[bindings.ICRC]
did = "candid/icrc.did"
# optional; default: <dir(did)>/<name>.mo  → candid/ICRC.mo
# out = "bindings/ICRC.mo"
```

### Where the file is written

1. `--output <path>` if given (single target only) — writes there; does not touch `mops.toml`.
2. `[bindings.<name>].out` if set — overwrites that path.
3. Default — `<name>.mo` next to the `.did` file.

Paths inside `.mops/` are rejected.

### Examples

Generate all configured bindings
```
mops generate bindings
```

Generate one binding
```
mops generate bindings ICRC
```

Ad-hoc (no `[bindings]` entry required; `mops.toml` optional)
```
mops generate bindings candid/icrc.did -o bindings/ICRC.mo
```

### Options

#### `--output`, `-o`

Write the generated `.mo` to the given path. Single binding or ad-hoc `.did` only. Does not update `mops.toml`.

#### `--verbose`

Show extra details (bytes written).

### Relation to `mops generate candid`

| Command | Direction | Typical use |
| --- | --- | --- |
| `mops generate candid` | Motoko → `.did` | Your canister's public interface |
| `mops generate bindings` | `.did` → Motoko | External service types for inter-canister calls |
