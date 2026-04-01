---
slug: /cli/mops-install
sidebar_label: mops install
---

# `mops install`

Install all dependencies specified in mops.toml
```
mops install
```

## Lockfile behavior

The lockfile is considered **up to date** when the `[dependencies]` and `[dev-dependencies]` in `mops.toml` haven't changed since the lockfile was last written.

- **Lockfile up to date** — installs the exact versions recorded in the lockfile, skipping dependency resolution.
- **Lockfile missing or out of date** — runs full dependency resolution, installs resolved versions, then creates/updates the lockfile.

See [mops.lock](/mops.lock) for details on lockfile contents and when to commit it.

## Options

### `--lock`

What to do with the [lockfile](/mops.lock).

Possible values:
- `update` — keep the lockfile in sync with current dependencies and verify file integrity (default)
- `check` — verify file integrity against an existing lockfile; fail if the lockfile is missing or out of date
- `ignore` — skip the lockfile entirely

### `--no-toolchain`

Do not install toolchain.

### `--verbose`

Verbose output.

## CI

In CI environments (`CI` env var is set), the default `--lock` mode is `check` instead of `update` — the lockfile is never auto-created in CI. If no lockfile is present in CI, integrity checking is silently skipped.

See [CI environments](/mops.lock#ci-environments) on the mops.lock page for full details.
