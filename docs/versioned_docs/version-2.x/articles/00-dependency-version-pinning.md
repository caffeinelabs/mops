---
slug: /dependency-version-pinning
sidebar_label: Dependency version pinning
---

# Dependency version pinning

Basically, there can be only one version of a package in the final dependency graph under a specific package name.
But in some cases, you may need to use two different versions of the same package. For this purpose, you can use version pinning.

The pinned dependency name must be in quotes.

The pinned dependency name must end with the pinned version prefix.

Example:
```toml
"package@1.2.3" = "1.2.3" # good
"package@1.1.0" = "2.1.0" # bad
```
<!--
"package@2" = "2.1.0" # good
"package@3" = "2.1.0" # bad -->

## Use case 1

Version pinning is useful when you need two different versions of the same package.

For example, you want to migrate from `8.1.0` to `9.0.1` version of the `map` package, but you need to keep the old version to migrate existing data to the new version.

How it can be done:

`mops.toml`
```toml
[dependencies]
map = "9.0.1"
"map@8.1.0" = "8.1.0"
```

`main.mo`
```motoko
import Map_8 "mo:map@8.1.0";
import Map_9 "mo:map";

let newMap = Map_9.fromIter(Map_8.entries(oldMap), Map_9.x_hash);
```

## Use case 2

Version pinning is useful when you want to hard pin a dependency version in your package published to the Mops registry.

For example, you can pin the `base` dependency to version `0.11.0`, so you can be sure that the new version of the `base` package will not break your package published to the Mops registry.

`mops.toml`
```toml
[package]
name = "your-package"
version = "1.0.0"

[dependencies]
"base@0.11.0" = "0.11.0"
```

User's `mops.toml`
```toml
[dependencies]
your-package = "1.0.0"
base = "0.20.0"
```

User wants to use `your-package` alongside with the `0.20.0` version of `base` package.

Here, user will use the `base` package version `0.20.0`, but your package is guaranteed to use the `base` package version `0.11.0`.