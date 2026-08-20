---
slug: /cli/mops-verify
sidebar_label: mops verify
---

# `mops verify`

Audit the installed dependencies against [`mops.lock`](../../10-mops.lock.md).

```
mops verify
```

`mops install` verifies files at download time, before they enter the cache, and does not re-hash `.mops/` on every run. `mops verify` is the on-demand full audit: it re-hashes every file the lockfile records and confirms the lockfile itself is still trustworthy.

It checks that:
- `mops.lock` exists, parses and is the current format version
- every file listed in `mops.lock` exists under `.mops/` with the recorded hash
- `mops.lock` pins every dependency declared in `mops.toml` to the same value
- `mops.lock`'s `deps` and `hashes` sections agree on the set of registry packages
- every file hash in `mops.lock` matches the Mops registry
- every GitHub dependency's directory under `.mops/_github/` still hashes to the tree `mops.lock` recorded for the pinned commit

On success it prints the number of packages and files verified and exits `0`. On failure it prints each problem with the recovery step and exits `1`.

```bash
$ mops verify
Integrity verified 6 package(s), 842 file(s)
```

## When to use it

- **After editing files under `.mops/` by accident.** Since 3.0, `mops install` tolerates a modified `.mops/` tree; `mops verify` is what reports it.
- **As a tamper gate.** If a pipeline relied on `mops install` failing when `.mops/` had been modified, run `mops verify` instead.
- **When a build behaves unexpectedly** and you want to rule out a modified dependency.

Registry packages are verified file by file, against the per-file hashes the registry publishes. GitHub (`repo`) dependencies are verified as a whole tree instead — GitHub publishes no hashes, so `mops.lock` records one `sha256` over the extracted directory and that is what gets re-checked. Local (`path`) dependencies are not verified at all: they point at live directories by design.

## Recovering

- A file under `.mops/` differs from the lockfile — delete that package's directory (`rm -rf .mops/<package>@<version>`) and run `mops install` to restore it from the cache.
- Files are missing from `.mops/` — run `mops install`.
- `mops.lock` itself disagrees with `mops.toml` or the registry — restore `mops.lock` from version control, or delete it and run `mops install` to regenerate it.
