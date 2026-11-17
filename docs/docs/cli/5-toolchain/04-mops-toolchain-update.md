---
slug: /cli/mops-toolchain-update
sidebar_label: mops toolchain update
---

# `mops toolchain update`

Update tools already pinned in `[toolchain]` to the newest compatible version and update `mops.toml`

```
mops toolchain update [tool] [--major]
```

Only tools present in the `[toolchain]` section of `mops.toml` are updated. Without an argument, every pinned tool is updated; with an argument, the command fails if that tool is not pinned yet — use [`mops toolchain use`](./03-mops-toolchain-use.md) for a first pin.

Like [`mops update`](../1-deps/04-mops-update.md) for packages, the update stays within the caret range of the pinned version: the same major version, or for a `0.x.y` pin, the same minor version. A project pinned to `moc` 1.16.1 gets the newest 1.x release, not 2.x. When a newer release is out of range, the command names it and the flag that installs it.

A pin that is not a semantic version, such as `wasm-opt` `133`, has no compatible range, so it changes only with `--major`. A pin to a local file is always skipped. To replace it, run [`mops toolchain use <tool> <version>`](./03-mops-toolchain-use.md).

## Options

### `--major`

Allow updates that cross the caret bound, to the stable release with the highest version. This is what [`mops toolchain use <tool> latest`](./03-mops-toolchain-use.md) installs.

```
mops toolchain update moc --major
```

## Examples

Update all pinned tools to the newest compatible version
```
mops toolchain update
```

Update specific tool to the newest compatible version
```
mops toolchain update moc
mops toolchain update wasmtime
mops toolchain update pocket-ic
mops toolchain update lintoko
mops toolchain update wasm-opt
```
