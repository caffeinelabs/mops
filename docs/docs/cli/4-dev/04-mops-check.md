---
slug: /cli/mops-check
sidebar_label: mops check
---

# `mops check`

Check Motoko files for syntax errors and type issues

```
mops check <files...>
```

Runs the Motoko compiler in check-only mode (`moc --check`) on the specified files. All package sources from the project are automatically included.

Exits with a non-zero code if any file has errors, making it suitable for CI pipelines. Warnings do not cause a failure by default.

### Examples

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
mops check src/main.mo --verbose
```

Treat warnings as errors
```
mops check src/main.mo -- -Werror
```

## Arguments

### `<files...>`

One or more paths to Motoko files to check. At least one file is required.

## Options

### `--verbose`

Print the full `moc` invocation before running it.

## Passing flags to the Motoko compiler

Any arguments after `--` are forwarded directly to `moc`. For example, to treat all warnings as errors:

```
mops check src/main.mo -- -Werror
```

:::info
`mops check` only type-checks files — it does not produce any compiled output. To compile canisters, use [`mops build`](/cli/mops-build).
:::
