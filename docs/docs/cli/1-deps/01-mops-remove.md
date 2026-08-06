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


### `--dry-run`

Do not actually remove anything

### `--verbose`

Verbose output.

The [lockfile](../../10-mops.lock.md) is always kept in sync — there is no flag to opt out.
