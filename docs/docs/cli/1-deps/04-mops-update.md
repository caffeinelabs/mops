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

`mops update` **rewrites `mops.toml`** — the new version is written back in place, in the section the dependency was declared in (like `cargo upgrade`, not `cargo update`, which only touches the lockfile). GitHub dependencies are re-pinned to their branch head.

### Example

Update the `core` package to the highest compatible version:

```
mops update core
```

## Exit codes

| Code | Meaning                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------- |
| `0`  | `mops.toml` is up to date                                                                           |
| `2`  | The update could not be run or completed — no `mops.toml`, unknown `[pkg]`, or a dependency failed to update (the others are still updated) |

Same vocabulary as [`mops outdated`](./03-mops-outdated.md#exit-codes), minus code `1`: after a successful `mops update` there is nothing left to report as outdated.

## Options

### `--major`

Allow updates that cross the caret bound — major versions, or for `0.x.y` packages, minor versions. For example, with `core = "2.0.0"` in `mops.toml`:

- `mops update core` → bumps within `2.x.y` (e.g. `2.5.0`)
- `mops update core --major` → also allows `3.0.0` or later, once published

Mutually exclusive with [`--patch`](#--patch).

### `--patch`

Restrict updates to patch versions only — never bumps minor or major. Useful for risk-averse upgrades. For example, with `core = "1.2.3"`:

- `mops update core` → may bump to `1.5.0` (within `1.x.y`)
- `mops update core --patch` → only bumps to `1.2.4`, `1.2.5`, … (never `1.3.0`)

For `0.x.y` packages this matches the default — caret already restricts pre-1.0 packages to patch updates.

Mutually exclusive with [`--major`](#--major).

### `--verbose`

Verbose output.

The [lockfile](../../10-mops.lock.md) is always kept in sync — there is no flag to opt out.
