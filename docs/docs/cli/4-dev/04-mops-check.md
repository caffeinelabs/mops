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

After applying fixes, `--fix` re-checks all files and runs stable compatibility checks (if configured). If type-checking fails after fixing, stable checks are skipped.

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

## Stable compatibility checking

When a canister has a `[canisters.<name>.check-stable]` section in `mops.toml`, `mops check` automatically runs a stable compatibility check after type-checking. This compares the deployed version against the current canister entrypoint to catch breaking changes to stable variables before deployment.

```toml
[canisters.backend]
main = "src/main.mo"

[canisters.backend.check-stable]
path = ".old/src/main.most"
```

If the file at `path` doesn't exist, the check fails with an error. To silently skip the stable check when the file is missing (useful for initial deployments where no previous version exists), set `skipIfMissing = true`:

```toml
[canisters.backend.check-stable]
path = ".old/src/main.most"
skipIfMissing = true
```

For more details, see [`mops check-stable`](/cli/mops-check-stable).

:::info
`mops check` only type-checks files — it does not produce any compiled output. To compile canisters, use [`mops build`](/cli/mops-build).
:::
