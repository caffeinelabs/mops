---
slug: /cli/toolchain
sidebar_label: Overview
---

# Toolchain Management with Mops

Mops simplifies toolchain management for Motoko projects, allowing you to specify exact versions of each tool in the `mops.toml` file for each project.

When you run `mops install` command, Mops will install the specified version of each tool.

## Available tools
- `moc` - Motoko compiler
- `wasmtime` - Wasmtime runtime (used by `mops test --mode wasi`)
- `pocket-ic` - PocketIC replica (used by `mops bench --replica pocket-ic`)
- `lintoko` - Extensible linter for Motoko ([https://github.com/caffeinelabs/lintoko](https://github.com/caffeinelabs/lintoko))

## Specifying tool versions

### Option 1: Use `mops toolchain use` command

You can use [`mops toolchain use`](/cli/mops-toolchain-use) command to install specific tool version and update `mops.toml` file.
```
mops toolchain use moc 0.10.3
mops toolchain use wasmtime 16.0.0
mops toolchain use pocket-ic 1.0.0
mops toolchain use lintoko 0.7.0
```

No need to run `mops install` when you use `mops toolchain use` command.

### Option 2: Edit `mops.toml` file

You can manually edit `mops.toml` file to specify exact versions of each tool.

```toml
[toolchain]
moc = "0.10.3"
wasmtime = "16.0.0"
lintoko = "0.7.0"
pocket-ic = "1.0.0"
```

You need to run `mops install` command when you edit `mops.toml` file manually.

### Option 3: Use explicit file paths

You can also specify file paths to toolchain binaries. This is useful when building a tool from source. File paths must start with `/`, `./`, or `../`.

```toml
[toolchain]
moc = "./tools/moc"
moc = "/usr/local/bin/moc"
lintoko = "../custom-lintoko/bin/lintoko"
```

## Toolchain management commands

- [`mops toolchain init`](/cli/mops-toolchain-init)
- [`mops toolchain use`](/cli/mops-toolchain-use)
- [`mops toolchain update`](/cli/mops-toolchain-update)
- [`mops toolchain bin`](/cli/mops-toolchain-bin)
- [`mops toolchain reset`](/cli/mops-toolchain-reset)