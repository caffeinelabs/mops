---
slug: /cli/mops-toolchain-bin
sidebar_label: mops toolchain bin
---

# `mops toolchain bin`

Print path to the specified tool binary.

```
mops toolchain bin <tool>
```

## Examples

Print path to the `moc` binary:
```
mops toolchain bin moc
```

Print path to the `wasmtime` binary:
```
mops toolchain bin wasmtime
```

Print path to the `pocket-ic` binary:
```
mops toolchain bin pocket-ic
```

Every tool must be pinned in `[toolchain]`; `mops toolchain bin` exits with an error otherwise. For `pocket-ic` the error names `mops toolchain use pocket-ic 15.0.0`.

Print path to the `lintoko` binary:
```
mops toolchain bin lintoko
```

### Run tool

You can run the version of the tool defined in `mops.toml` by running:
```
$(mops toolchain bin <tool>) <args>
```

Run `moc`:
```
$(mops toolchain bin moc)
```

Run `moc` with mops packages:
```
$(mops toolchain bin moc) $(mops sources) --version
```

Run `pocket-ic`:
```
$(mops toolchain bin pocket-ic)
```

Run `wasmtime`:
```
$(mops toolchain bin wasmtime)
```