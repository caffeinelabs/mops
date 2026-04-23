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

Install latest version of a package with a caret range (default)
```
mops add core
```
This writes `core = "^x.y.z"` to `mops.toml`, allowing compatible updates.

Install a specific exact version
```
mops add core@1.2.0
```
This writes `core = "1.2.0"` to `mops.toml` (exact pin).

Install with a specific range
```
mops add core@^1.2.0
mops add core@~1.2.0
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

What to do with the [lockfile](/mops.lock)

Default value is `update` if lockfile exists and `ignore` otherwise.

Possible values:
- `update` - update lockfile (create if not exists). Always checks after update
- `ignore` - ignore lockfile

### `--verbose`

Verbose output.