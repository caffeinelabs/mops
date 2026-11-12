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

Uses [`mo-fmt`](#mo-fmt) when it is pinned in `[toolchain]`. Without the pin, `mops format` falls back to the bundled [Prettier plugin](#prettier-plugin), which is deprecated and will be removed in a future major version, and prints a warning. To switch, see [Switch from the Prettier plugin](#switch-from-prettier).

Files inside `node_modules/`, `.mops/`, `.git/`, `.dfx/`, `dist/`, `build/` and `bundle/` are skipped, as are directories below the project root that are their own checkout — a git worktree, a submodule, a nested clone — so a copy of the project checked out beside it is never reformatted.

Files the project's `.gitignore` excludes are skipped too, such as generated sources. The filter does not bring them back. As in git, every `.gitignore` from the root of the repository down to the file counts, but the global excludes file and `.git/info/exclude` do not, so every machine selects the same files. Whether a file is tracked does not matter. A project outside a repository, or in a directory its repository ignores, reads only its own `.gitignore` files.

## `mo-fmt` {#mo-fmt}

`mo-fmt` is the standalone Motoko formatter, released from [caffeinelabs/tree-sitter-motoko](https://github.com/caffeinelabs/tree-sitter-motoko). Pin it to use it:

```
mops toolchain use mo-fmt 0.5.0
```

```toml
[toolchain]
mo-fmt = "0.5.0"
```

With `mo-fmt` pinned, `mops format` runs that binary and nothing else: there is no fallback to the Prettier plugin, and `.prettierrc` is not read. Builds exist for macOS and Linux, not Windows; on Windows, run `mops` under WSL.

`mo-fmt` normalises spacing and indentation and keeps your line breaks: a list written on one line stays on one line, and one broken across lines goes one item per line. It does not wrap long lines.

`mops format` selects the files as above and passes them to `mo-fmt`, run from the project root. `mo-fmt` formats every file it is given, so the `.gitignore` rules above are applied by `mops format`, not by `mo-fmt`. The output is `mo-fmt`'s own: one line per file that was formatted (with `--check`, that would change), paths relative to the project root, then a summary line. A file that fails to format — a syntax error, or a result that would parse differently from the original — is reported on stderr, left untouched, and makes `mops format` exit non-zero; the other files are still formatted.

Configure it with an optional `mo-fmt.toml` in the project root, next to `mops.toml`:

```toml
syntax = "preserve"   # default; or "moc2" to rewrite legacy syntax to the moc 2.0 forms
indent-width = 2
trailing-commas = "multiline"   # one of the rules; each overrides `syntax`
```

Besides `syntax` and `indent-width`, each formatting rule is a key of its own, such as `trailing-commas`, `semicolons`, `block-blank-lines` and `imports`. The [`mo-fmt` README](https://github.com/caffeinelabs/tree-sitter-motoko/tree/main/mo-fmt#configuration) lists them all. Flags passed after [`--`](#mo-fmt-flags) override these keys one by one.

A `// mo-fmt-ignore` comment leaves the next item as written. `// prettier-ignore` works too.

## Switch from the Prettier plugin {#switch-from-prettier}

The [Prettier plugin](https://github.com/caffeinelabs/prettier-plugin-motoko) is deprecated and no longer maintained, so new Motoko syntax will not be supported. To move a project to `mo-fmt`:

1. Pin `mo-fmt`:

   ```
   mops toolchain use mo-fmt 0.5.0
   ```

2. If `.prettierrc` sets options for `.mo` files, move them to `mo-fmt.toml` in the project root:

   | `.prettierrc`             | `mo-fmt.toml`                                         |
   | ------------------------- | ----------------------------------------------------- |
   | `tabWidth`                | `indent-width`                                        |
   | `useTabs`                 | None: `mo-fmt` indents with spaces only               |
   | `printWidth`              | None: line breaks are kept as written                 |
   | `bracketSpacing`          | None: always `{ x = 1 }`                              |
   | `semi: false`             | `semicolons = "minimal"`                              |
   | `trailingComma: "all"`    | `trailing-commas = "multiline"`                       |
   | `trailingComma: "none"`   | `trailing-commas = "never"`                           |

   Then remove `prettier-plugin-motoko` from `.prettierrc` and `package.json`, if it is there.

3. Format the project and commit the result on its own, so the reformat stays out of other changes:

   ```
   mops format --verify
   ```

   `--verify` runs `mops check` afterwards and reverts the formatting if it fails. `mo-fmt` keeps line breaks as written, so code the Prettier plugin already formatted changes little.

4. Leave CI as it is: `mops format --check` now checks with `mo-fmt`.

The Motoko extension for VS Code still formats with the Prettier plugin, so its format-on-save and `mops format` can disagree. Until the extension moves to `mo-fmt`, turn format-on-save off for Motoko in `.vscode/settings.json` and run `mops format` instead:

```json
{
  "[motoko]": {
    "editor.formatOnSave": false
  }
}
```

## Prettier plugin (deprecated) {#prettier-plugin}

Without `mo-fmt` pinned, `mops format` uses [Prettier](https://prettier.io) with the [Motoko plugin](https://github.com/caffeinelabs/prettier-plugin-motoko) bundled in `mops`. It is deprecated: every run prints a warning, and the plugin will be removed in a future major version. [Switch to `mo-fmt`](#switch-from-prettier).

To configure it, add a `.prettierrc` file to the root of the project.

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

### `-- <mo-fmt flags>` {#mo-fmt-flags}

Arguments after `--` are forwarded to `mo-fmt`, ahead of the file list. They override `mo-fmt.toml` key by key, so an option can be tried without writing the file:

```
mops format -- --syntax moc2
mops format -- --indent-width 4
mops format backend/ --check -- --syntax moc2
```

`mo-fmt --help` lists them, such as `--syntax <preserve|moc2>`, `--indent-width <N>`, and, from 0.3.0, `--rule <name>=<value>`. A flag `mo-fmt` rejects fails the run with its usage error. Without `mo-fmt` pinned, `mops format` refuses them, since the Prettier plugin takes no flags. After a failed `--check`, the suggested command keeps the flags, since they are part of what was checked.

`moc2` rewrites legacy syntax to the moc 2.0 forms: it braces every control body, drops the parentheses around control heads and case patterns where moc 2.0 allows it, and drops the `;` after a braced `case` arm. The result only compiles on moc 2.0 (in beta, e.g. `2.0.0-beta.2`), not on moc 1.x, and the rewrite may change between `mo-fmt` minor versions while moc 2.0 is in beta. Pair it with [`--verify`](#--verify) so a rewrite the pinned `moc` rejects is reverted:

```
mops format --verify -- --syntax moc2
```

### `--verify`

Format, then run [`mops check`](./04-mops-check.md) and put the files back as they were if it fails. `mops check` is the judge of a formatter bug: formatting that stops the project compiling is not kept.

```
mops format --verify
```

- `mops check` is not run before formatting, so run it on a passing project. If the project was already failing, every formatted file is reverted.
- The check is the one `mops check` runs with no arguments: every canister, stable compatibility where `[check-stable]` is configured, and lint when `lintoko` is pinned. A package without canisters checks the formatted files instead, as `mops check <files>` would.
- The check only runs when at least one file was reformatted. Files it does not compile — tests, modules no canister imports, and migrations trimmed by `check-limit` — are formatted but not verified.
- A file edited while the check runs is not reverted, and the error lists it.
- Works with both `mo-fmt` and the deprecated Prettier plugin. Cannot be combined with `--check`.

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