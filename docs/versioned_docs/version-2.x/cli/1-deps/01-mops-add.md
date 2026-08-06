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

Install latest `base` package from `mops` registry
```
mops add base
```

Install specific version of `base` package from `mops` registry
```
mops add base@0.10.0
```

Add package from GitHub
```
mops add https://github.com/caffeinelabs/motoko-base
```

For GitHub-packages you can specify branch, tag, or commit hash by adding `#<branch/tag/hash>`
```
mops add https://github.com/caffeinelabs/motoko-base#moc-0.9.1
```

Add local package
```
mops add ./shared
```

## Options

### `--dev`
Add package to `[dev-dependencies]` section.

### `--lock`

What to do with the [lockfile](../../10-mops.lock.md)

Default: `update` (create or refresh the lockfile, then verify). Unaffected by the `CI` environment variable — dependency-mutating commands always update the lock by default.

Possible values:
- `update` — update lockfile (create if not exists). Always checks after update
- `ignore` — ignore lockfile

### `--verbose`

Verbose output.