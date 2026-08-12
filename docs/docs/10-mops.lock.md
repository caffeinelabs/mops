---
slug: /mops.lock
sidebar_label: mops.lock
---

# `mops.lock` file

`mops.lock` is used to ensure integrity of dependencies, so that you can be sure that all dependencies have exactly the same source code as they had when the package author published them to the Mops Registry.

`mops.lock` is created automatically the first time dependencies are installed, and kept up to date on every subsequent run. It is triggered by:
- `mops install`
- `mops add`
- `mops remove`
- `mops update`
- `mops sync`
- `mops init` (when it installs dependencies)

`mops.lock` is maintained by Mops and should not be manually edited.

## Should you commit `mops.lock`?

The answer depends on whether your project is an **application** or a **library**.

**Applications** (canisters, scripts, frontends) — commit `mops.lock`. It guarantees that every developer and CI environment installs the exact same dependency versions.

**Libraries** (packages published to the Mops registry) — add `mops.lock` to `.gitignore`. Your library will be used as a dependency inside other projects, and those projects will resolve their own dependency graph. Committing your lock file could mislead contributors into thinking the locked versions are significant.

```bash
# .gitignore entry for library authors
mops.lock
```

This is the same convention used by [Cargo](https://doc.rust-lang.org/cargo/faq.html#why-do-binaries-have-cargolock-in-version-control-but-not-libraries).

## Performance

A valid `mops.lock` speeds up `mops install` because it avoids resolving intermediate dependency versions.

_It's only faster when there are no globally cached packages — for example when running `mops install` inside a fresh Docker container or for the first time in a project._

## What `mops.lock` contains

- Hash of the `[dependencies]` and `[dev-dependencies]` sections of `mops.toml`
- All transitive dependencies with the final resolved versions
- Hash of each file of each dependency (retrieved from the Mops registry canister)
- The declared dependencies of every registry package version in the graph (`graph`), including versions that lost a conflict and were not installed

The `graph` section lets Mops update the lock after `mops add`, `remove`, `update` or `sync` without re-downloading package manifests: published versions are immutable, so recorded dependencies never go stale. Local path dependencies are not recorded — their manifests are always read from disk. Locks written by older CLIs have no `graph`; Mops then falls back to reading manifests from the cache, downloading any that are missing.

For the same reason, updating the lock after a dependency change carries file hashes of already-locked packages over and queries the registry only for packages new to the lock. `mops install --lock update` always refetches every hash from the registry, so it remains the recovery command for a lock with corrupt hashes.

Local path dependencies are stored relative to the project root (e.g. `./packages/shared`, `../lib`) so the lockfile is portable across machines. A plain `mops install` will not rewrite an older lock that still has absolute paths — run `mops install --lock update` explicitly. `--lock check` also will not flag absolute local paths (it compares the lock to itself when the deps hash matches). After regenerating, use a CLI that includes this fix; older CLIs treat relative lock paths as cwd-relative and break when run from a subdirectory.

## CI environments

**Deprecated:** when the `CI` environment variable is set and `--lock` is omitted, `mops install` defaults to `--lock check` and prints a deprecation warning. This auto-detection will be removed in a future release — pass `--lock check` explicitly (and commit `mops.lock`) to keep that behavior.

Note: explicit `--lock check` errors when the lock is missing; the deprecated CI auto-path skips a missing lock. If the lock is stale, regenerate with `mops install --lock update`.

Dependency-mutating commands (`mops add`, `mops remove`, `mops update`, `mops sync`) always default to updating the lockfile, even when `CI` is set.

## Opting out

To skip lock file creation and checks for a single run, pass `--lock ignore` to `mops install`, `mops add`, `mops remove`, `mops update`, or `mops sync`:

```bash
mops install --lock ignore
mops add <package> --lock ignore
```
