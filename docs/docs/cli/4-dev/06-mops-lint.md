---
slug: /cli/mops-lint
sidebar_label: mops lint
---

# `mops lint`

Lint Motoko source files using [lintoko](https://github.com/caffeinelabs/lintoko)

```
mops lint [filter]
```

Runs `lintoko` on all `.mo` files in the project. If a filter is provided, only files matching `**/*<filter>*.mo` are linted.

Rules are loaded from a `lint/` or `lints/` directory in the project root (if present), or can be specified with `--rules`.

### Examples

Lint all Motoko files
```
mops lint
```

Lint files matching a filter
```
mops lint Backend
```

Lint and apply fixes
```
mops lint --fix
```

Use a custom rules directory
```
mops lint --rules ./my-rules
```

Pass additional arguments to lintoko
```
mops lint -- --severity warning
```

## Options

### `--fix`

Automatically apply lint fixes.

### `--verbose`

Show the full `lintoko` invocation before running it and pass `--verbose` to `lintoko`.

### `--rules`, `-r`

Specify one or more directories containing lint rules. Can be used multiple times. Defaults to `lint/` or `lints/` if they exist.

```
mops lint --rules ./rules-a --rules ./rules-b
```

## Configuration

Extra `lintoko` flags can be set in `mops.toml`:

```toml
[lint]
args = ["--severity", "warning"]
```

See also: [toolchain management](/cli/toolchain) to pin a `lintoko` version.
