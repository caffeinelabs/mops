---
slug: /mops.toml
sidebar_label: mops.toml
---

# `mops.toml` file

## [package]

| Field        | Description                                      |
| ------------ | ------------------------------------------------ |
| name         | Package name (e.g. `lib`)                          |
| version      | Package version in format x.y.z (e.g. `0.1.2`)     |
| description  | Package description shown in search results      |
| repository   | Repository url (e.g. `https://github.com/dfinity/motoko-base`).<br/>Can include subdirs (see note below) |
| keywords     | Array of keywords (max 10 items, max 20 chars)   |
| license      | Package license. Use [SPDX license identifier](https://spdx.org/licenses/) (e.g. `MIT`) |

:::note
Repository URL can include subdirectory when the package is located not in the root of the repository.

Example for vetkeys package https://github.com/dfinity/vetkeys/tree/main/backend/mo/ic_vetkeys
```toml
repository = "https://github.com/dfinity/vetkeys/backend/mo/ic_vetkeys"
```

Make sure there is no `/tree/main/` in the URL.
:::

## [dependencies]

| Field                 | Description                                     |
| --------------------- | ----------------------------------------------- |
| <mops_package_name><br/>Example: `base`        | Version in format x.y.z (e.g. `0.1.2`)              |
| <mops_package_name>@<pinned_version><br/>Example: `base@0.11.0`        | Version in format x.y.z (e.g. `0.1.2`)              |
| <github_package_name><br/>Example: `gh-pkg` | Format: `https://github.com/<repo>#<branch/tag/ref>`<br/>Example: `https://github.com/dfinity/motoko-base#moc-0.11.0` |


Learn how Mops resolves dependencies [here](/how-dependency-resolution-works).

Learn about version pinning [here](/dependency-version-pinning).


## [dev-dependencies]

Same structure as `[dependencies]`.

`dev-dependencies` are only used for testing and benchmarking purposes. They are not installed when the package is used as a dependency.


## [toolchain]
See [toolchain management](/cli/toolchain) page for more details.

| Field                | Description                                      |
| -------------------- | ------------------------------------------------ |
| moc                  | Motoko compiler version (e.g. `1.0.0`) or file path (e.g. `./tools/moc`, `/usr/local/bin/moc`)   |
| wasmtime             | WASM runtime version (e.g. `41.0.0`) or file path used to run [tests](/cli/mops-test#--mode) in `wasi` mode   |
| pocket-ic            | Local IC replica version (e.g. `12.0.0`) or file path used to run [benchmarks](/cli/mops-bench#--replica)   |
| lintoko              | Linter version (e.g. `0.7.0`) or file path for Motoko linting   |

File paths must start with `/`, `./`, or `../`.


## [requirements]

When a user installs your package(as a transitive dependency too), Mops will check if the requirements are met and display a warning if they are not.

Use only if your package will not work with older versions of the `moc`.

| Field                | Description                                      |
| -------------------- | ------------------------------------------------ |
| moc                  | Motoko compiler version  (e.g. `0.11.0` which means `>=0.11.0`)  |