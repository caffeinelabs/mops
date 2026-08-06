---
slug: /cli/mops-remove
sidebar_label: mops remove
---

# `mops remove`

Alias `mops rm`

Remove package and update mops.toml

```
mops remove <package_name>
```

## Options

### `--dev`
Remove package from `[dev-dependencies]` section.

### `--lock`

What to do with the [lockfile](../../10-mops.lock.md).

Default: `update` (create or refresh the lockfile, then verify). Unaffected by the `CI` environment variable — dependency-mutating commands always update the lock by default.

Possible values:
- `update` - update lockfile (create if not exists). Always checks after update
- `ignore` - ignore lockfile

### `--dry-run`

Do not actually remove anything

### `--verbose`

Verbose output.