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

Uses [Prettier](https://prettier.io) with [Motoko](https://github.com/caffeinelabs/prettier-plugin-motoko) plugin.

## Configuration

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