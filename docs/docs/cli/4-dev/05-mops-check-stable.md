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

The baseline is always a committed `.most` file — see [Getting a baseline](#getting-a-baseline). The command handles the rest internally: generating the current `.most` stable type signature, comparing it against the baseline, and cleaning up intermediate files. On `moc` 1.12.0+ some [diagnostics improve](#diagnostics-on-moc-1120).

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

Check against a baseline path directly
```
mops check-stable deployed/backend.most
```

Check a specific canister against a baseline path
```
mops check-stable deployed/backend.most backend
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

When the first argument looks like a file path:

```
mops check-stable <baseline.most> [canister]
```

- **`<baseline.most>`** — Path to the deployed version's stable type signature. Must be a `.most` file.
- **`[canister]`** — Name of the canister to check against. When omitted, auto-detected if exactly one canister is defined; errors if multiple canisters exist.

## Getting a baseline

The baseline must be a `.most` file, in both canister mode and file mode. A `.mo` source is rejected:

```
[canisters.backend.check-stable].path must be a .most file, got: deployed.mo
```

`mops build` writes a `.most` for each canister alongside its `.wasm` and `.did`. [`mops deployed`](./09-mops-deployed.md) promotes that file into a committed `deployed/<name>.most` baseline; run it as a post-deploy hook so the baseline always describes the running canister. Before the first deploy, `mops deployed init <canister>` creates an empty-actor baseline and wires `[canisters.<name>.check-stable].path` to it.

A `.mo` source is not accepted because it describes whatever that source says today, not what the deployed canister actually holds — the two drift the moment someone edits the file, and the check silently passes against the wrong state.

## Options

### `--verbose`

Show detailed output including the `moc` commands being run and the intermediate file paths.

### `--no-check-limit`

Use the full migration chain, ignoring `[canisters.<name>.migrations].check-limit`. See [chain trimming](./08-mops-migrate.md#chain-trimming). Also suppresses the pending-migration warning that runs when `check-limit` is set.

### `--locked`

Require an up-to-date [`mops.lock`](../../10-mops.lock.md) and never write it — fails if the lockfile is missing or no longer matches `mops.toml` and the registry. Intended for CI, so that a job can run this command without a preceding `mops install`. See [`mops install --locked`](../1-deps/02-mops-install.md#--locked).

## Pending migration diagnostic

When `[canisters.<name>.migrations].check-limit` is set, `mops check-stable` compares the deployed `.most` baseline against the local chain after the compatibility check. If more migrations are pending than `check-limit` allows, mops reports a diagnostic naming the latest pending file to fold into. If compat already failed, this replaces the misleading `moc` error (trimming started from the wrong state). If compat passed anyway, it is shown as a warning.

On `moc` 1.12.0+ this diagnostic can also replace type errors from the same run. The command still exits non-zero; fold the pending migrations (or pass `--no-check-limit`) to see them.

## Enhanced migration support

When a canister has a `[canisters.<name>.migrations]` section in `mops.toml`, `mops check-stable` automatically injects the `--enhanced-migration` flag when generating stable type signatures.

## Diagnostics on moc 1.12.0+

On `moc` 1.12.0 or newer, two diagnostics improve for canisters that have `[migrations]` configured:

- A field the initial actor requires that no migration produces now **fails** the check (`M0267`) instead of only warning (`M0254`). If a forgotten migration used to slip through as a warning, expect it to be an error now. Fields the baseline already provides with a compatible type stay a warning.
- Compatibility errors point at your source — `src/main.mo:3.1-11.2` — instead of `(unknown location)`.

Older `moc` pins and canisters without `[migrations]` are unaffected.

## Passing flags to the Motoko compiler

Any arguments after `--` are forwarded to `moc` when generating stable type signatures.

```
mops check-stable -- --experimental-stable-memory=1
```

:::tip
Global `moc` flags configured in `[moc].args` and per-canister flags in `[canisters.<name>].args` are automatically applied. See [`mops.toml` reference](../../09-mops.toml.md#moc).
:::
