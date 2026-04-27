---
slug: /cli/mops-update
sidebar_label: mops update
---

# `mops update`

Update all dependencies to the highest semver-compatible version (caret-bound by default — does not cross major versions, or pre-1.0 minor versions).
```
mops update
```

Update only a specific dependency
```
mops update [pkg]
```

### Example

Update the `core` package to the highest compatible version:
```
mops update core
```

## Options

### `--major`

Allow updates that cross the caret bound — major versions, or for `0.x.y` packages, minor versions. For example, with `core = "2.0.0"` in `mops.toml`:
- `mops update core` → bumps within `2.x.y` (e.g. `2.5.0`)
- `mops update core --major` → also allows `3.0.0` or later, once published

### `--lock`

What to do with the [lockfile](/mops.lock).

Default value is `update` if lockfile exists and `ignore` otherwise.

Possible values:
- `update` - update lockfile (create if not exists). Always checks after update
- `ignore` - ignore lockfile