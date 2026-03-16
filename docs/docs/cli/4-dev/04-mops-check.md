---
slug: /cli/mops-check
sidebar_label: mops check
---

# `mops check`

Check Motoko files for syntax errors and type issues

```
mops check [files...]
```

Runs the Motoko compiler in check-only mode (`moc --check`). All package sources from the project are automatically included.

When no files are specified, checks all canister entrypoints defined in the `[canisters]` section of `mops.toml`.

Exits with a non-zero code if any file has errors, making it suitable for CI pipelines. Warnings do not cause a failure by default.

### Examples

Check all canister entrypoints defined in `mops.toml`
```
mops check
```

Check a single file
```
mops check src/main.mo
```

Check multiple files
```
mops check src/main.mo src/types.mo
```

Check with verbose output (shows the compiler command being run)
```
mops check --verbose
```

Treat warnings as errors
```
mops check -- -Werror
```

## Arguments

### `[files...]`

One or more paths to Motoko files to check. When omitted, all canister entrypoints from `mops.toml` are checked.

## Options

### `--fix`

Automatically apply fixes for supported diagnostics, including transitively imported files. Fixed files and the applied fix codes are printed to the console.

```
mops check --fix
```

### `--verbose`

Print the full `moc` invocation before running it.

## Passing flags to the Motoko compiler

Any arguments after `--` are forwarded directly to `moc`. For example, to treat all warnings as errors:

```
mops check -- -Werror
```

:::tip
Global `moc` flags can be configured in `mops.toml` under `[moc].args` so they don't need to be passed on every invocation. See [`mops.toml` reference](/mops.toml#moc).
:::

:::info
`mops check` only type-checks files — it does not produce any compiled output. To compile canisters, use [`mops build`](/cli/mops-build).
:::
