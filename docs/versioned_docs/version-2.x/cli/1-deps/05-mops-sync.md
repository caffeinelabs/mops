---
slug: /cli/mops-sync
sidebar_label: mops sync
---

# `mops sync`

Analyze source code and:
- Add missing packages that are used in the source code but are not listed in `mops.toml`
- Remove unused packages listed in `mops.toml` but not imported in the source code

```
mops sync
```

## Options

### `--lock`

What to do with the [lockfile](/mops.lock).

Default: `update` (create or refresh the lockfile, then verify). Unaffected by the `CI` environment variable — dependency-mutating commands always update the lock by default.

Possible values:
- `update` - update lockfile (create if not exists). Always checks after update
- `ignore` - ignore lockfile