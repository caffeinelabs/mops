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

## Version conflicts

When dependency resolution runs, `mops install` reports any **registry** dependency that two packages in the graph request at different **major** versions:

```
Warning! Conflicting major versions of dependency "test"
  test 1.2.0 is a dependency of legacy@1.0.0
  test 2.1.2 is a dependency of my-app@1.0.0
  Resolved to test 2.1.2 — dependents on another major compile against an API they did not ask for.
  If you want a different version, pin it in your root mops.toml — a root dependency always wins.
```

Resolution still succeeds: the highest major wins, unless your own `mops.toml` pins the dependency, in which case yours wins. Packages differing only in minor or patch version are not conflicts and are not reported. Neither are `repo` or `path` dependencies, which carry no comparable major version.

Since resolution is skipped when the lockfile is up to date, the report appears on the run that creates or updates `mops.lock`. If you have reviewed a conflict and decided to keep it, [`mops sources --conflicts ignore`](/cli/mops-sources#--conflicts) silences it for `dfx` builds.

## Options

### `--lock`

What to do with the [lockfile](/mops.lock).

Possible values:
- `update` — keep the lockfile in sync with current dependencies and verify file integrity (default outside CI). Pass explicitly to force regeneration if the lockfile is stale or corrupt.
- `check` — verify file integrity against an existing lockfile; fail if the lockfile is missing or out of date
- `ignore` — skip the lockfile entirely

### `--no-toolchain`

Do not install toolchain.

### `--verbose`

Verbose output.

## CI

**Deprecated:** when the `CI` environment variable is set and `--lock` is omitted, `mops install` still defaults to `--lock check` and prints a deprecation warning. This auto-detection will be removed in a future release — pass `--lock check` explicitly (and commit `mops.lock`) to keep failing on a stale lockfile.

Note: explicit `--lock check` also errors when the lock is missing; the deprecated CI auto-path skips a missing lock. If the lockfile is stale, install fails and suggests `mops install --lock update`.

`mops add`, `mops remove`, `mops update`, and `mops sync` are unaffected — they always default to updating the lockfile.

See [CI environments](/mops.lock#ci-environments) on the mops.lock page for full details.
