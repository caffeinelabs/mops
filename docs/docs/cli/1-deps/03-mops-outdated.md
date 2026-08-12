---
slug: /cli/mops-outdated
sidebar_label: mops outdated
---

# `mops outdated`

Print available dependency updates within the caret bound (does not cross major versions, or pre-1.0 minor versions).
```
mops outdated
```

Check only a specific dependency
```
mops outdated [pkg]
```

Nothing is written — `mops.toml` and the [lockfile](../../10-mops.lock.md) are left untouched. Use [`mops update`](./04-mops-update.md) to apply the updates it reports.

```bash
$ mops outdated
Available updates:
core 1.0.0 -> 1.2.0
mydep 1111111 -> 06d7c77 (github: org/repo#master)
```

## Reported dependencies

`mops outdated` reports exactly what [`mops update`](./04-mops-update.md) would change:

- **registry packages** — the highest version within the bound (see [`--major`](#--major) / [`--patch`](#--patch))
- **GitHub packages** — the branch head, when it differs from the commit pinned in `mops.toml`. Old and new commits are shown abbreviated; a dependency that pins a branch without a commit is shown as `unpinned`. Each GitHub dependency costs one call to the unauthenticated GitHub API, which is [rate-limited to 60 requests per hour per IP](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).

Hard-pinned registry packages (e.g. `"core@1.2.3" = "1.2.3"`) and local `path` dependencies are never reported — `mops update` does not move them either.

## Exit codes

Suitable as a CI gate: a stale dependency is distinguishable from a failed lookup.

| Code | Meaning |
|---|---|
| `0` | Everything is up to date |
| `1` | Updates are available |
| `2` | The check could not be completed — no `mops.toml`, unknown `[pkg]`, or a registry / GitHub lookup that failed |

Code `2` wins over `1`: if any lookup fails, the report is incomplete, so it is never reported as `0` or as a plain "outdated".

## Options

### `--major`

Also report updates that cross the caret bound. Mirrors [`mops update --major`](./04-mops-update.md#--major).
```
mops outdated --major
```

### `--patch`

Restrict reported updates to patch versions only. Mirrors [`mops update --patch`](./04-mops-update.md#--patch).
```
mops outdated --patch
```

Mutually exclusive with [`--major`](#--major).
