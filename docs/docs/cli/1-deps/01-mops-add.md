---
slug: /cli/mops-add
sidebar_label: mops add
---

# `mops add`

Install a specific package and save it to `mops.toml`
```
mops add <package_name>
```

### Examples

Install latest `core` package from `mops` registry
```
mops add core
```

Install specific version of `core` package from `mops` registry
```
mops add core@1.0.0
```

Add package from GitHub
```
mops add https://github.com/caffeinelabs/motoko-base
```

The `org/repo` shorthand resolves to a GitHub repository
```
mops add caffeinelabs/motoko-base
```

For GitHub-packages you can specify branch, tag, or commit hash by adding `#<branch/tag/hash>`
```
mops add https://github.com/caffeinelabs/motoko-base#moc-0.9.1
```

Add local package
```
mops add ./shared
```

## Sections

A package is never declared twice: adding a package that is already declared in the other section moves it. `mops add <package_name> --dev` moves an existing `[dependencies]` entry to `[dev-dependencies]`, and `mops add <package_name>` moves it back.

## Versions

`mops add <package_name>@<version>` on an already-declared package replaces its version, and prints the [pinned alias](../../articles/00-dependency-version-pinning.md) to add if you want to keep both versions.

An already-declared pinned alias is updated under its own key: with `"map@8.1.0" = "8.1.0"` in `mops.toml`, `mops add map@8.1.0` rewrites that entry instead of collapsing it to the bare `map` key.

## Options

### `--dev`
Add package to `[dev-dependencies]` section.


### `--verbose`

Verbose output.

The [lockfile](../../10-mops.lock.md) is always kept in sync — there is no flag to opt out.
