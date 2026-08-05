---
slug: /cli/mops-watch
sidebar_label: mops watch
sidebar_position: 5
---

# `mops watch`

Watch Motoko files, check them for syntax errors and warnings, and format them

```
mops watch
```

By default, `mops watch` runs the safe informative set:
- Check for syntax errors
- Check for warnings
- Format Motoko files

Tests, declaration generation and deploys are **opt-in** — they run only when requested with `--test`, `--generate` or `--deploy`.

Passing any flag runs only the selected tasks (error checking is always on).

## Options

### `--error`

Check Motoko files for syntax errors.

Always enabled.

```
mops watch --error
```

### `--warning`

Check Motoko files for warnings.

Part of the default set (runs when no flags are passed).

```
mops watch --warning
```

### `--format`

Format Motoko files.

Part of the default set (runs when no flags are passed).

```
mops watch --format
```

### `--test`

Run Motoko tests. Opt-in — never runs unless this flag is passed.

```
mops watch --test
```

:::info
Replica tests use `pocket-ic` if it's pinned in `mops.toml` under `[toolchain]`, otherwise they fall back to the `dfx` replica, which is **deprecated** and will be removed in a future release. Run `mops toolchain use pocket-ic 12.0.0` to pin a PocketIC version and silence the warning.
:::

### `--generate`

Generate declarations for Motoko canisters from `dfx.json` that have `declarations` field. Opt-in — never runs unless this flag is passed.

```
mops watch --generate
```

### `--deploy`

Deploy Motoko canisters to the local replica. Opt-in — never runs unless this flag is passed.

```
mops watch --deploy
```

## Examples

Check syntax errors, show warnings and format files (the default set)

```
mops watch
```

Check syntax errors and show warnings (no formatting)

```
mops watch --warning
```

Check syntax errors, run tests, generate declarations and deploy canisters

```
mops watch --test --generate --deploy
```
or
```
mops watch -tgd
```