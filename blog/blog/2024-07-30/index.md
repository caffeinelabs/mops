---
slug: 2024-07-30-updates
title: Updates 30 July, 2024
authors: [zen]
tags: []
---


### Summary
- First Mops blog post
- Common nav bar
- Mops CLI updates
- GitHub Action update
- Documentation updates
- GitHub dependency name restrictions

<!-- truncate -->

## Mops blog

(by [@ZenVoich](https://github.com/ZenVoich))

This is the first blog post of the new Mops blog.

Further Mops updates will be posted here. Previous updates can be found in the [Dfinity forum](https://forum.dfinity.org/t/mops-on-chain-package-manager-for-motoko/17275/17).

## Common nav bar

(by [@ZenVoich](https://github.com/ZenVoich))

Added a common nav bar to all subdomains for easier navigation.

## Mops CLI updates

**`0.45.0`** by [@ZenVoich](https://github.com/ZenVoich)
- Updated npm dependencies
- Added `--no-install` flag to `mops sources` command
- Added `--verbose` flag to `mops publish` command
- Added support for [dependency version pinning](https://docs.mops.one/dependency-version-pinning)
- Suppress hashing tool detecting error in `moc-wrapper.sh` on Linux
- Fixed `moc-wrapper` error when no `.mops` folder exists
- Fixed cache folder delete on github install error

## GitHub Action update

(by [@ZenVoich](https://github.com/ZenVoich))

New version `1.3.1` of [`setup-mops`](https://github.com/dfinity/setup-mops) action is released.

The action is updated to use the on-chain storage to install Mops, which gave a **2x** speedup to the installation process (from ~20s to ~10s).

If you are using the action in this way:

```yaml
- uses: dfinity/setup-mops@v1
```

no changes are required from your side.

## Documentation updates

(by [@ZenVoich](https://github.com/ZenVoich))

- Added a new page [How dependency resolution works](https://docs.mops.one/how-dependency-resolution-works)
- Added a new page [How to version a package](https://docs.mops.one/how-to-version-a-package)
- Added a new page [Dependency version pinning](https://docs.mops.one/dependency-version-pinning)

## GitHub dependency name restrictions

(by [@ZenVoich](https://github.com/ZenVoich))

Now you cannot publish a package with a github dependency whose name is already taken in the Mops registry.

This helps to avoid confusion when resolving packages with the same name from different sources, because they can be completely different packages.

Example:
```toml
[dependencies]
base = "https://github.com/dfinity/motoko-base#moc-0.12.0" # bad
base_gh_0_12_0 = "https://github.com/dfinity/motoko-base#moc-0.12.0" # ok
any-other-name = "https://github.com/dfinity/motoko-base#moc-0.12.0" # ok
```