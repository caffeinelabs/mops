---
slug: /cli/mops-format
sidebar_label: mops format
sidebar_position: 3
---

# `mops format`

Format Motoko source files

```
mops format
```

Filter files by name

```
mops format [filter]
```

Alias `mops fmt`

Uses [Prettier](https://prettier.io) with [Motoko](https://github.com/caffeinelabs/prettier-plugin-motoko) plugin, or [`mo-fmt`](#mo-fmt) when it is pinned in `[toolchain]`.

Files inside `node_modules/`, `.mops/`, `.git/`, `.dfx/`, `dist/`, `build/` and `bundle/` are skipped, as are directories below the project root that are their own checkout — a git worktree, a submodule, a nested clone — so a copy of the project checked out beside it is never reformatted.

## `mo-fmt` {#mo-fmt}

`mo-fmt` is the standalone Motoko formatter, released from [caffeinelabs/tree-sitter-motoko](https://github.com/caffeinelabs/tree-sitter-motoko). Pin it to use it:

```
mops toolchain use mo-fmt 0.1.0
```

```toml
[toolchain]
mo-fmt = "0.1.0"
```

With `mo-fmt` pinned, `mops format` runs that binary and nothing else: there is no fallback to the Prettier plugin, and `.prettierrc` is not read. Without the pin, `mops format` uses the Prettier plugin as before. Builds exist for macOS and Linux, not Windows.

`mops format` selects the files as above and passes them to `mo-fmt`, run from the project root. The output is `mo-fmt`'s own: one line per file that was formatted (with `--check`, that would change), paths relative to the project root, then a summary line. A file that fails to format — a syntax error, or a result that would parse differently from the original — is reported on stderr, left untouched, and makes `mops format` exit non-zero; the other files are still formatted.

Configure it with an optional `mo-fmt.toml` in the project root, next to `mops.toml`:

```toml
syntax = "preserve"   # default; or "moc2" to rewrite legacy syntax to the moc 2.0 forms
indent-width = 2
```

## Configuration

This section covers the Prettier plugin. For `mo-fmt`, see [`mo-fmt`](#mo-fmt).

Add `.prettierrc` file to the root of the project.

```json
{
  "overrides": [{
    "files": "*.mo",
    "options": {
      "useTabs": true
    }
  }]
}
```

Supported options:

| Option              | Type            | Default      | Description                                                         |
| ------------------- | --------------- | ------------ | ------------------------------------------------------------------- |
| **useTabs**         | boolean         | false        | Use tabs instead of spaces for indentation                          |
| **tabWidth**        | number          | 2            | Number of spaces per indentation level (only if `useTabs` is false) |
| **printWidth**      | number          | 80           | Maximum line length before wrapping                                 |
| **semi**            | boolean         | true         | Add semicolons at the end of statements                             |
| **bracketSpacing**  | boolean         | true         | Add spaces between brackets in object literals                      |
| **trailingComma**   | "all" or "none" | "all"        | Add trailing commas wherever possible                               |

## Options

### `--check`

Check if files are formatted correctly without modifying them.

```
mops format --check
```

## Examples

Format all Motoko files in the project

```
mops format
```

Filter files by directory

```shell
mops format backend/main/
# will format all files in the `backend/main` directory.
```

Filter files by name
```shell
mops format DownloadLog
# will format files that match `**/*DownloadLog*.mo` pattern.
```

Check if files are formatted correctly without modifying them

```
mops format --check
```