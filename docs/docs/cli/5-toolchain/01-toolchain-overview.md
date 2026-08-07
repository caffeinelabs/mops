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
- `pocket-ic` - PocketIC replica (used by `mops bench` and `mops test --mode replica`)
- `lintoko` - Extensible linter for Motoko ([https://github.com/caffeinelabs/lintoko](https://github.com/caffeinelabs/lintoko))
- `wasm-opt` - Binaryen Wasm optimizer (used when [`[optimize]`](../../09-mops.toml.md#optimize) is set)

## Specifying tool versions

### Option 1: Use `mops toolchain use` command

You can use [`mops toolchain use`](./03-mops-toolchain-use.md) command to install specific tool version and update `mops.toml` file.
```
mops toolchain use moc 0.10.3
mops toolchain use wasmtime 16.0.0
mops toolchain use pocket-ic 12.0.0
mops toolchain use lintoko 0.7.0
mops toolchain use wasm-opt 131
```

No need to run `mops install` when you use `mops toolchain use` command.

### Option 2: Edit `mops.toml` file

You can manually edit `mops.toml` file to specify exact versions of each tool.

```toml
[toolchain]
moc = "0.10.3"
wasmtime = "16.0.0"
lintoko = "0.7.0"
pocket-ic = "12.0.0"
wasm-opt = "131"
```

You need to run `mops install` command when you edit `mops.toml` file manually.

### `pocket-ic` versions {#pocket-ic-versions}

`pocket-ic` is the one tool with a default: if `[toolchain]` has no `pocket-ic` entry, `mops test --mode replica` and `mops bench` download and run **`14.0.0`**. The default is a fixed constant baked into the CLI, never a "latest" lookup, so warming the cache ahead of time (in a Docker image build, for example) is enough to keep later runs off the network entirely.

Any version from `9.0.0` up can be pinned, `latest` included. Mops keeps no list of blessed versions — as with `moc`, `wasmtime` and `lintoko`, the version you pin is the version you get.

Pins **below `9.0.0`** are rejected with a migration message. They worked in Mops 2.x through a second, legacy PocketIC client, which 3.0.0 removed; without the check, upgrading with an old pin would fail with an opaque timeout from the client instead. Run `mops toolchain use pocket-ic 14.0.0`.

### Option 3: Use explicit file paths

You can also specify file paths to toolchain binaries. This is useful when building a tool from source. File paths must start with `/`, `./`, or `../`.

```toml
[toolchain]
moc = "./tools/moc"
```

or

```toml
[toolchain]
moc = "/usr/local/bin/moc"
lintoko = "../custom-lintoko/bin/lintoko"
```

## Toolchain management commands

- [`mops toolchain use`](./03-mops-toolchain-use.md)
- [`mops toolchain update`](./04-mops-toolchain-update.md)
- [`mops toolchain info`](./07-mops-toolchain-info.md)
- [`mops toolchain bin`](./05-mops-toolchain-bin.md)