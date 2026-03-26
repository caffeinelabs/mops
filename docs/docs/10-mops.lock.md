---
slug: /mops.lock
sidebar_label: mops.lock
---

# `mops.lock` file

`mops.lock` is used to ensure integrity of dependencies, so that you can be sure that all dependencies have exactly the same source code as they had when the package author published them to the Mops Registry.

`mops.lock` is created automatically the first time you run any of the following commands, and kept up to date on every subsequent run:
- `mops install`
- `mops add`
- `mops remove`
- `mops update`
- `mops sync`
- `mops init`

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

## CI environments

In CI, if `mops.lock` does not exist, integrity checking is skipped and no lock file is created. To enforce the lock in CI, commit `mops.lock` to your repository before running CI.

## Opting out

To skip lock file creation and checks for a single run, pass `--lock ignore` to `mops install`, `mops add`, `mops remove`, `mops update`, or `mops sync`:

```bash
mops install --lock ignore
mops add <package> --lock ignore
```
