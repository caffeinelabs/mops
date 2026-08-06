---
slug: /cli/mops-cache
sidebar_label: mops cache
---

# `mops cache`

Mops caches the downloaded files(package sources, toolchains binaries) to speed up the installation process.

When you run `mops install`, `mops add <pkg>` or `mops toolchain use/update`, Mops will download the files and store them in the cache directory. For subsequent installations, Mops will use the cached files instead of downloading them again.

Local cache directory is created in the project root in the `.mops` directory.

The integrity of cached files is verified using the [mops.lock](/mops.lock) file.

### `mops cache show`

Print global cache directory path.

### `mops cache size`

Print global cache size.

### `mops cache clean`

Clean global and local cache directories.