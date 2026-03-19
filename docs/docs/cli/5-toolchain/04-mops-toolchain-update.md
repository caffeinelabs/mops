---
slug: /cli/mops-toolchain-update
sidebar_label: mops toolchain update
---

# `mops toolchain update`

Update specified tool or all tools to the latest version and update `mops.toml`

```
mops toolchain update [tool]
```

## Examples

Update all tools to the latest version
```
mops toolchain update
```

Update specific tool to the latest version
```
mops toolchain update moc
mops toolchain update wasmtime
mops toolchain update pocket-ic
mops toolchain update lintoko
```