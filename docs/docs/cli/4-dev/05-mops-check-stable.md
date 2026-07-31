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

The command handles the full workflow internally: generating `.most` stable type signatures, comparing them, and cleaning up intermediate files. On moc 1.12.0+ the comparison happens inside a single compiler invocation — see [single-invocation checking](#single-invocation-checking-on-moc-1120).

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
`mops build` generates a `.most` file for each canister alongside `.wasm` and `.did`. Use [`mops deployed`](/cli/mops-deployed) as a post-deploy hook to promote that `.most` into a committed `deployed/<name>.most` baseline, and configure `[canisters.<name>.check-stable]` in `mops.toml` so `mops check-stable` (and `mops check`) verify upgrade safety automatically on every run.
:::

## Options

### `--verbose`

Show detailed output including the `moc` commands being run and the intermediate file paths.

### `--no-check-limit`

Use the full migration chain, ignoring `[canisters.<name>.migrations].check-limit`. See [chain trimming](/cli/mops-migrate#chain-trimming). Also suppresses the pending-migration warning that runs when `check-limit` is set.

## Pending migration diagnostic

When `[canisters.<name>.migrations].check-limit` is set, `mops check-stable` compares the deployed `.most` baseline against the local chain after the compatibility check. If more migrations are pending than `check-limit` allows, mops reports a diagnostic naming the latest pending file to fold into. If compat already failed, this replaces the misleading `moc` error (trimming started from the wrong state). If compat passed anyway, it is shown as a warning.

The replacement only happens when trimming accounts for every diagnostic `moc` reported (`M0169`, `M0254`, `M0263`, `M0267`). If the failure also carries an unrelated error — an ordinary type error, say — `moc`'s output is shown and the pending-migration diagnostic is demoted to a warning, so a compile failure is never hidden behind it. This matters on moc 1.12.0+, where a trimmed chain's missing field is itself a type error (`M0267`).

The warning only applies when the baseline is a committed `.most` file (via `[check-stable].path` or passed as a `.most` argument). Baselines compiled from a `.mo` source on the command line are skipped — the scratch `.most` would not reflect what is actually deployed.

## Enhanced migration support

When a canister has a `[canisters.<name>.migrations]` section in `mops.toml`, `mops check-stable` automatically injects the `--enhanced-migration` flag when generating stable type signatures.

## Single-invocation checking on moc 1.12.0+

moc 1.12.0 can run the upgrade check as part of type-checking, via `--stable-baseline <deployed.most>`. When it is available, `mops check-stable` uses it instead of the 3-step workflow:

```bash
# moc < 1.12.0 — three invocations
moc --stable-types -o .mops/…/old.wasm deployed.mo …   # only for a .mo baseline
moc --stable-types -o .mops/…/new.wasm src/main.mo …
moc --stable-compatible deployed.most .mops/…/new.most

# moc 1.12.0+
moc src/main.mo --check --all-libs --stable-baseline deployed.most --enhanced-migration=… …
```

This applies when **both** hold:

- The baseline is a `.most` file — from `[check-stable].path` or passed as a `.most` argument. A `.mo` baseline is still compiled to `.most` first.
- The canister uses enhanced migration, which `moc --stable-baseline` requires. Canisters without `[migrations]` (or an explicit `--enhanced-migration` in `args`) keep the 3-step path.

Anything else — an older moc pin, a non-`.most` baseline, a non-EM canister — behaves exactly as before. Two diagnostics change when the single-invocation path is used:

- A field the initial actor requires but no migration produces is a type error [**M0267**] instead of a warning [M0254]. Fields whose baseline type is already a stable subtype of the required type stay M0254.
- Compatibility errors report a source location (`src/main.mo:3.1-11.2`) rather than `(unknown location)`.

Run with `--verbose` to see which path was taken.

## Passing flags to the Motoko compiler

Any arguments after `--` are forwarded to `moc` when generating stable type signatures.

```
mops check-stable -- --experimental-stable-memory=1
```

:::tip
Global `moc` flags configured in `[moc].args` and per-canister flags in `[canisters.<name>].args` are automatically applied. See [`mops.toml` reference](/mops.toml#moc).
:::
