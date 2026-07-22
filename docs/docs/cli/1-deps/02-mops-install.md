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
- `update` — keep the lockfile in sync with current dependencies and verify file integrity (default). Pass explicitly to force regeneration if the lockfile is stale or corrupt.
- `check` — verify file integrity against an existing lockfile; fail if the lockfile is missing or out of date
- `ignore` — skip the lockfile entirely

### `--no-toolchain`

Do not install toolchain.

### `--verbose`

Verbose output.

## CI

**Deprecated:** when the `CI` environment variable is set and `--lock` is omitted, `mops install` still defaults to `--lock check` and prints a deprecation warning. This auto-detection will be removed in a future release — pass `--lock check` explicitly (or a future `mops ci` / `--frozen` mode) to keep failing on a stale lockfile.

While the auto-path remains: the lockfile is never auto-created in CI. If no lockfile is present, integrity checking is silently skipped. If the lockfile is stale, install fails and suggests `mops install --lock update`.

`mops add`, `mops remove`, `mops update`, and `mops sync` are unaffected — they always default to updating the lockfile.

See [CI environments](/mops.lock#ci-environments) on the mops.lock page for full details.
