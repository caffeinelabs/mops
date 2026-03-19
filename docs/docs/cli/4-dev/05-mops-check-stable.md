---
slug: /cli/mops-check-stable
sidebar_label: mops check-stable
---

# `mops check-stable`

Check stable variable compatibility between a previously deployed version and the current canister entrypoint

```
mops check-stable <old-file> [canister]
```

Verifies that an upgrade from an old actor to the current canister entrypoint is safe — i.e., that stable variable signatures are compatible. This prevents `Memory-incompatible program upgrade` traps at deploy time.

The command handles the full workflow internally: generating `.most` stable type signatures, comparing them, and cleaning up intermediate files.

### Examples

Check upgrade compatibility using the old source file
```
mops check-stable .old/src/backend/main.mo
```

Check using a pre-generated `.most` file
```
mops check-stable /path/to/deployed.most
```

Check a specific canister in a multi-canister project
```
mops check-stable .old/src/backend/main.mo backend
```

Check with verbose output
```
mops check-stable .old/src/backend/main.mo --verbose
```

## Arguments

### `<old-file>`

Path to the old (deployed) version of the actor. Accepts two formats:

- **`.mo` file** — the old Motoko source file. The command generates the `.most` stable type signature automatically.
- **`.most` file** — a pre-generated stable type signature. Used directly without compilation.

### `[canister]`

Name of the canister to check against (as defined in `mops.toml`). The current entrypoint is resolved from `[canisters.<name>].main`.

When omitted:
- If there is exactly one canister defined, it is used automatically
- If there are multiple canisters, an error is shown listing the available names

## Options

### `--verbose`

Show detailed output including the `moc` commands being run and the intermediate file paths.

## Passing flags to the Motoko compiler

Any arguments after `--` are forwarded to `moc` when generating stable type signatures.

```
mops check-stable .old/src/main.mo -- --experimental-stable-memory=1
```

:::tip
Global `moc` flags configured in `[moc].args` are automatically applied. See [`mops.toml` reference](/mops.toml#moc).
:::
