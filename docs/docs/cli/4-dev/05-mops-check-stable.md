---
slug: /cli/mops-check-stable
sidebar_label: mops check-stable
---

# `mops check-stable`

Check stable variable compatibility between a previously deployed version and the current canister entrypoint

```
mops check-stable [args...]
```

Verifies that an upgrade from an old actor to the current canister entrypoint is safe — i.e., that stable variable signatures are compatible. This prevents `Memory-incompatible program upgrade` traps at deploy time.

The command handles the full workflow internally: generating `.most` stable type signatures, comparing them, and cleaning up intermediate files.

When checking canisters, per-canister `[canisters.<name>].args` from `mops.toml` are applied alongside global `[moc].args`.

### Examples

Check all canisters that have `[check-stable]` configured in `mops.toml`
```
mops check-stable
```

Check a specific canister by name
```
mops check-stable backend
```

Check upgrade compatibility using an old source file
```
mops check-stable .old/src/backend/main.mo
```

Check using a pre-generated `.most` file
```
mops check-stable /path/to/deployed.most
```

Check a specific canister using an old file
```
mops check-stable .old/src/backend/main.mo backend
```

Check with verbose output
```
mops check-stable backend --verbose
```

## Usage modes

### Canister mode (recommended)

When no arguments are given, or when arguments are canister names:

```
mops check-stable
mops check-stable backend
```

Resolves the old (deployed) file from `[canisters.<name>.check-stable].path` in `mops.toml`. Per-canister `[canisters.<name>].args` are applied to `moc`.

With no arguments, all canisters that have `[check-stable]` configured are checked. Canisters without `[check-stable]` are silently skipped. When a canister name is given explicitly but has no `[check-stable]` config, an error is shown.

### File mode

When the first argument looks like a file path (`.mo` or `.most`):

```
mops check-stable <old-file> [canister]
```

- **`<old-file>`** — Path to the old (deployed) version. A `.mo` file is compiled to extract stable types; a `.most` file is used directly.
- **`[canister]`** — Name of the canister to check against. When omitted, auto-detected if exactly one canister is defined; errors if multiple canisters exist.

:::tip
`mops build` generates a `.most` file for each canister alongside `.wasm` and `.did`. Save it before deploying an upgrade, then configure `[canisters.<name>.check-stable]` in `mops.toml` so `mops check-stable` (and `mops check`) verify upgrade safety automatically on every run.
:::

## Options

### `--verbose`

Show detailed output including the `moc` commands being run and the intermediate file paths.

## Passing flags to the Motoko compiler

Any arguments after `--` are forwarded to `moc` when generating stable type signatures.

```
mops check-stable -- --experimental-stable-memory=1
```

:::tip
Global `moc` flags configured in `[moc].args` and per-canister flags in `[canisters.<name>].args` are automatically applied. See [`mops.toml` reference](/mops.toml#moc).
:::
