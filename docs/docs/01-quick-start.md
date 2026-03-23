---
# sidebar_position: 0.1
# sidebar_label: 'Quick Start'
---

# Quick Start

## 1. Prerequisites
- [Node.js](https://nodejs.org/) >= 22.0.0
- [DFX](https://internetcomputer.org/docs/current/developer-docs/quickstart/local-quickstart) >= 0.10.0

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
Run this command in the root directory of your project (where is `dfx.json` placed)

```
mops init
```

## 4. Configure dfx.json
Add `mops` as a packtool to your `dfx.json`

```json
{
  "defaults": {
    "build": {
      "packtool": "mops sources"
    }
  }
}
```

## 5. Install Motoko Packages
Use [`mops add`](/cli/mops-add) to install a specific package and save it to `mops.toml`

```
mops add base
```

## 6. Import Package
Now you can import installed packages in your Motoko code

```motoko
import Array "mo:base/Array";
```