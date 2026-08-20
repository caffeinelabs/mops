---
slug: /cli/mops-cache
sidebar_label: mops cache
---

# `mops cache`

Mops caches the downloaded files(package sources, toolchains binaries) to speed up the installation process.

When you run `mops install`, `mops add <pkg>` or `mops toolchain use/update`, Mops will download the files and store them in the cache directory. For subsequent installations, Mops will use the cached files instead of downloading them again.

Local cache directory is created in the project root in the `.mops` directory.

Files are verified as they are downloaded, before they enter the cache. When [mops.lock](../../10-mops.lock.md) already records the package, its hashes are the reference — a local, committed record, so no registry round trip is needed. Otherwise the hashes published in the Mops registry are used.

Verification happens on download, so a package served from the cache is not re-hashed. To audit what is already on disk, run [`mops verify`](../1-deps/06-mops-verify.md).

### `mops cache show`

Print global cache directory path.

### `mops cache size`

Print global cache size.

### `mops cache clean`

Clean global and local cache directories.

Pass `--global` to clean only the global cache and keep the project's `.mops` directory:

```
mops cache clean --global
```

Run outside a project (no `mops.toml` in any parent directory), `mops cache clean` only cleans the global cache.