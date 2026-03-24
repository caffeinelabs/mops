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

Rules are loaded from a `lint/` or `lints/` directory in the project root (if present), or can be specified with `--rules`. Rules from installed package dependencies can also be included via the `extends` config option.

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

The `[lint]` section in `mops.toml` controls how rules are collected.

### `extends`

Pull in `rules/` directories from installed package dependencies. This is the primary way to consume lint rules shipped by a library.

Include rules from specific dependencies:

```toml
[lint]
extends = ["base", "map"]
```

Include rules from ALL dependencies (including transitive ones):

```toml
[lint]
extends = true
```

Works similarly to ESLint plugins — packages expose rule files that consumers explicitly opt into. Named entries (`extends = ["pkg"]`) pull in only the listed packages. `extends = true` pulls in every resolved package including transitive dependencies, so prefer named entries in projects with large dependency graphs.

### `rules`

Override the default rule directories with one or more local paths. When set, the auto-discovered `lint/` and `lints/` directories are ignored in favour of the directories listed here.

```toml
[lint]
rules = ["my-rules"]
```

Rules from `[lint] extends` are always included on top, regardless of this setting.

### `args`

Extra flags forwarded to `lintoko`:

```toml
[lint]
args = ["--severity", "warning"]
```

### Combining options

```toml
[lint]
extends = ["base"]
rules = ["my-extra-rules"]
args = ["--severity", "warning"]
```

:::tip
The `--rules` CLI flag overrides all configured rule directories (including `[lint] rules`, `extends`, and the default `lint/`/`lints/`). Use it for one-off overrides without changing `mops.toml`.
:::

## Publishing rules with a package

Packages can ship lintoko rules for their consumers by placing `.toml` rule files in a `rules/` directory at the package root. Consumers opt into them via `[lint] extends`.

This is distinct from the `lint/` or `lints/` directories, which are used to check the package itself and are not consumed by downstream users.

```
my-package/
├── src/           # Motoko source (published, used via mops sources)
├── rules/         # Lintoko rules for consumers (published)
└── lint/          # Lintoko rules for self-check (not for consumers)
```

Exits with a non-zero code if any lint errors are found.

See also: [toolchain management](/cli/toolchain) to pin a `lintoko` version.
