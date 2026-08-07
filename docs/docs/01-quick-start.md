---
# sidebar_position: 0.1
# sidebar_label: 'Quick Start'
---

# Quick Start

## 1. Prerequisites
- [Node.js](https://nodejs.org/) >= 20.0.0

Mops downloads and manages the Motoko toolchain itself — `moc`, `pocket-ic`, `wasmtime`, `lintoko`, `wasm-opt`. It does not need `dfx` installed. If you deploy with `dfx`, see [step 7](#7-configure-dfxjson-optional).

## 2. Install Mops CLI

Install from on-chain storage

```shell
curl -fsSL cli.mops.one/install.sh | sh
```

or install from npm registry
```shell
npm i -g ic-mops
```

## 3. Initialize
Run this command in the root directory of your project

```
mops init
```

## 4. Pin the Motoko compiler
Every command that compiles — [`mops build`](./cli/4-dev/03-mops-build.md), [`mops check`](./cli/4-dev/04-mops-check.md), [`mops test`](./cli/4-dev/01-mops-test.md) — uses the `moc` pinned in `mops.toml`.

```
mops toolchain use moc latest
```

Run [`mops toolchain info moc --versions`](./cli/5-toolchain/07-mops-toolchain-info.md) to see what is available, and see [toolchain management](./cli/5-toolchain/01-toolchain-overview.md) for the rest of the tools.

## 5. Install Motoko Packages
Use [`mops add`](./cli/1-deps/01-mops-add.md) to install a specific package and save it to `mops.toml`

```
mops add core
```

## 6. Import Package
Now you can import installed packages in your Motoko code

```motoko
import Array "mo:core/Array";
```

## 7. Configure dfx.json (optional)
If you deploy with `dfx`, add `mops` as a packtool to your `dfx.json` so `dfx build` resolves mops packages:

```json
{
  "defaults": {
    "build": {
      "packtool": "mops sources"
    }
  }
}
```

[`mops init`](./cli/00-mops-init.md) does this for you when `dfx.json` already exists. To make `dfx build` use the pinned `moc` too, run [`mops toolchain init`](./cli/5-toolchain/02-mops-toolchain-init.md).