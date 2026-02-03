---
slug: /cli/mops-toolchain-use
sidebar_label: mops toolchain use
---

# `mops toolchain use`

Install specific tool version and update `mops.toml` file.

```
mops toolchain use <tool> [version]
```

## Examples

Install specific tool version
```
mops toolchain use moc 0.10.3
mops toolchain use wasmtime 16.0.0
mops toolchain use pocket-ic 1.0.0
mops toolchain use lintoko 0.7.0
```

You can specify `latest` as version to install the latest available version.
```
mops toolchain use moc latest
```

If a version is not specified, you will be prompted to select the version from the list of available versions.
```
mops toolchain use moc
```

![user prompt image](mops-toolchain-use-moc.png)