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

`mops sync` compiles nothing, but it does read your imports with `moc`, so it requires a pinned [`[toolchain] moc`](../5-toolchain/01-toolchain-overview.md).

### `--dry-run`

Print what would be added and removed without touching `mops.toml`, the local cache or the [lockfile](../../10-mops.lock.md).

```
mops sync --dry-run
```

```
Missing packages: core, fuzz
Unused packages: itertools
Would add core
Would add fuzz (dev)
Would remove itertools
```

When there is nothing to do, it prints `Everything is in sync`.

## Dev dependencies

A package imported only from `test`, `tests`, `bench` or `benchmark` directories is added to `[dev-dependencies]`. A package imported anywhere else is added to `[dependencies]`, even if it is also used in tests.

Packages that are already declared are never moved between the two sections — `mops sync` only classifies packages it adds.

## Pinned aliases

[Pinned aliases](../../articles/00-dependency-version-pinning.md) are matched against imports verbatim, so `mo:map@8.1.0` corresponds to the `"map@8.1.0"` key and `mo:map` to the `map` key. The two are tracked independently: removing one never rewrites the other.

## Lockfile

The [lockfile](../../10-mops.lock.md) is always kept in sync — there is no flag to opt out, except `--dry-run`, which writes nothing at all.
