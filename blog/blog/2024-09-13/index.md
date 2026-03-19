---
slug: 2024-09-13-updates
title: Updates 13 September, 2024
authors: [zen]
tags: []
---

### Summary
- Mops CLI updates (v1.0.0)
- Keywords validation
- Search package by owner principal id
- Verifiable Mops CLI builds
- Package Registry site updates

<!-- truncate -->

## Mops CLI updates

### Release 1.0.0 🚀

Run `mops self update` to update Mops CLI to the latest version.

- `mops cache clean` now cleans local cache too (`.mops` folder)
- Conflicting dependencies are now reported on `mops add/install/sources`
- New `--conflicts <action>` option in `mops sources` command ([docs](https://docs.mops.one/cli/mops-sources#--conflicts))
- New "Stable Memory" and "Garbage Collection" metrics are now reported in the `mops bench` command
- `mops test` command now supports `replica` mode for running actor tests ([docs](https://docs.mops.one/cli/mops-test#--mode))
- New `--replica` option in `mops test` command
- Updated npm dependencies
- Fixed bug with GitHub dependency with branch name containing `/`

**Breaking changes**:
- Default replica in `mops bench` and `mops test` commands now is `pocket-ic` if `pocket-ic` is specified in `mops.toml` in `[toolchain]` section and `dfx` otherwise
- The only supported version of `pocket-ic` is `4.0.0`
- Dropped support for `wasmtime` version `< 14.0.0`
- Default reporter in `mops test` command is now `files` if test file count is > 1 and `verbose` otherwise
- Renamed `mops import-identity` command to `mops user import`
- Renamed `mops whoami` command to `mops user get-principal`
- Removed the ability to install a specific package with `mops install <pkg>` command. Use `mops add <pkg>` instead
- Removed legacy folders migration code. If you are using Mops CLI  `<= 0.21.0`, you need first to run `npm i -g ic-mops@0.45.3` to migrate your legacy folders. After that, you can run `mops self update` to update your Mops CLI to the latest version
- Removed `--verbose` flag from `mops sources` command

## Keywords validation

Now, the keywords are validated when publishing a package. Keywords should conform to the following pattern: `[a-z0-9-]`.

## Search package by owner principal id

Now you can search packages by the owner principal id. Just click on the owner principal id and you will see all packages by that owner.

## GitHub Action update

New version `1.4.0` of [`setup-mops`](https://github.com/dfinity/setup-mops) action is released.

- Add caching for macOS
- Use node v22

## Verifiable Mops CLI builds

Mops CLI builds are now produced in deterministic way using Docker and can be verified by anyone.

Get the version, commit hash and build hash from the [CLI releases](https://cli.mops.one) page and run the following commands inside the `cli` directory:

```
docker build . --build-arg COMMIT_HASH=<commit_hash> --build-arg MOPS_VERSION=<mops_version> -t mops
docker run --rm --env SHASUM=<build_hash> mops
```

[Documentation](https://github.com/caffeinelabs/mops/blob/main/cli/DEVELOPMENT.md#verify-build).


## Package Registry site updates

- Stable memory and garbage collection metrics are now available on "Benchmarks" tab for newly published packages
- Size metrics in package benchmarks are now formatted in a human readable way (127_643_156 -> 121.73 MiB)
- On the home page, the "Recently updated" section now contains package changes
- New section "New Packages" on the home page
- Categories section redesigned
- Package descriptions are now shown on the package page
- Package categories are now auto assigned based on keywords