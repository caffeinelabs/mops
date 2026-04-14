---
slug: /cli/mops-check
sidebar_label: mops check
---

# `mops check`

Check Motoko canisters or files for syntax errors and type issues

```
mops check [args...]
```

Runs the Motoko compiler in check-only mode (`moc --check`). All package sources from the project are automatically included.

Arguments can be **canister names** (as defined in `[canisters]`) or **file paths**. When no arguments are given, checks all canisters defined in the `[canisters]` section of `mops.toml`.

When checking canisters, per-canister `[canisters.<name>].args` from `mops.toml` are applied alongside global `[moc].args`.

Exits with a non-zero code if any file has errors, making it suitable for CI pipelines. Warnings do not cause a failure by default.

### Examples

Check all canisters defined in `mops.toml`
```
mops check
```

Check a specific canister
```
mops check backend
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

### `[args...]`

Canister names or file paths to check.

- **Canister names** — resolved from `[canisters.<name>]` in `mops.toml`. Per-canister `args` are applied.
- **File paths** — `.mo` files to check directly. Only global `[moc].args` and CLI `-- flags` are applied.
- **No arguments** — checks all canisters defined in `mops.toml`.

You cannot mix canister names and file paths in the same invocation.

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

## Lint integration

After type-checking succeeds, `mops check` automatically runs [`mops lint`](/cli/mops-lint) when `lintoko` is pinned in `[toolchain]`.

This means `mops check` is the single command for all correctness checks — type errors and lint violations are both caught in one pass.

```
mops check --fix
```

`--fix` is forwarded to both the Motoko compiler and lintoko, so both type-level and lint fixes are applied in a single invocation.

:::note
When file paths are passed explicitly (e.g. `mops check src/Main.mo`), linting is scoped to those files. When checking canisters (by name or with no arguments), linting covers all `.mo` files in the project.
:::

:::info
`mops check` only type-checks files — it does not produce any compiled output. To compile canisters, use [`mops build`](/cli/mops-build).
:::
