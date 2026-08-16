---
slug: /cli/mops-toolchain-update
sidebar_label: mops toolchain update
---

# `mops toolchain update`

Update tools already pinned in `[toolchain]` to the latest version and update `mops.toml`

```
mops toolchain update [tool]
```

Only tools present in the `[toolchain]` section of `mops.toml` are updated. Without an argument, every pinned tool is updated; with an argument, the command fails if that tool is not pinned yet — use [`mops toolchain use`](./03-mops-toolchain-use.md) for a first pin.

## Examples

Update all pinned tools to the latest version
```
mops toolchain update
```

Update specific tool to the latest version
```
mops toolchain update moc
mops toolchain update wasmtime
mops toolchain update pocket-ic
mops toolchain update lintoko
mops toolchain update wasm-opt
```
