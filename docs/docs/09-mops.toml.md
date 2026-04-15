---
slug: /mops.toml
sidebar_label: mops.toml
---

# `mops.toml` file

All relative paths in `mops.toml` are resolved relative to the directory containing the file. This applies to canister entrypoints, candid paths, local dependencies, build output directories, moc flags with path arguments, and any other path-valued setting.

## [package]

| Field         | Description                                      |
| ------------- | ------------------------------------------------ |
| name          | Package name (e.g. `lib`)                          |
| version       | Package version in format x.y.z (e.g. `0.1.2`)     |
| description   | Package description shown in search results      |
| repository    | Repository url (e.g. `https://github.com/caffeinelabs/motoko-base`).<br/>Can include subdirs (see note below) |
| keywords      | Array of keywords (max 10 items, max 20 chars)   |
| license       | Package license. Use [SPDX license identifier](https://spdx.org/licenses/) (e.g. `MIT`) |
| files         | Array of glob patterns for files to include when publishing (default `["**/*.mo"]`) |
| baseDir       | Base directory for package sources (default `src`). Used by `mops sources` to resolve the package entrypoint |
| readme        | Path to README file (default `README.md`)        |

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
| `<mops_package_name>`<br/>Example: `base`        | Version in format x.y.z (e.g. `0.1.2`)              |
| `<mops_package_name>@<pinned_version>`<br/>Example: `base@0.11.0`        | Version in format x.y.z (e.g. `0.1.2`)              |
| `<local_package_name>`<br/>Example: `shared` | Local path starting with `./`, `../`, or `/`<br/>Example: `./packages/shared` |

:::note
GitHub dependencies are not allowed in `[dependencies]`. Please publish the dependency to the Mops registry instead.
:::

Learn how Mops resolves dependencies [here](/how-dependency-resolution-works).

Learn about version pinning [here](/dependency-version-pinning).


## [dev-dependencies]

Same structure as `[dependencies]`, with the exception that GitHub dependencies are allowed.

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


## [moc]

Global Motoko compiler flags applied to all `moc` invocations (`check`, `check-stable`, `build`, `test`, `bench`, `watch`).

| Field | Description |
| ----- | ----------- |
| args  | Array of flags to pass to `moc` (e.g. `["--default-persistent-actors", "-Werror"]`) |

Example:
```toml
[moc]
args = ["--default-persistent-actors", "-W=M0223,M0236,M0237"]
```

These flags are applied before per-canister `[canisters.<name>].args` and CLI `-- flags`. For `mops build`, `[build].args` are also applied (after `[moc].args`, before per-canister args).

Use `mops moc-args` to print the moc flags defined in `mops.toml` (useful when invoking `moc` directly).


## [canisters]

Define Motoko canisters for [`mops build`](/cli/mops-build), [`mops check`](/cli/mops-check), and [`mops check-stable`](/cli/mops-check-stable).

Each canister entry specifies the entrypoint file and optional compiler settings.

| Field    | Description                                                     |
| -------- | --------------------------------------------------------------- |
| main     | Path to the main Motoko file (required)                         |
| args     | Array of additional `moc` arguments for this canister (optional). Applied after `[moc].args` in `check`, `check-stable`, and `build`. |
| candid   | Path to a Candid interface file for compatibility checking (optional) |
| initArg  | Candid-encoded initialization arguments (optional)              |

Example:
```toml
[canisters.backend]
main = "src/main.mo"
args = ["--incremental-gc"]
candid = "candid/backend.did"
initArg = "(\"Hello\")"
```

Multi-canister example with per-canister flags:
```toml
[canisters.backend]
main = "src/backend/main.mo"

[canisters.backend.migrations]
chain = "migrations/backend"
next = "next-migration/backend"

[canisters.frontend]
main = "src/frontend/main.mo"
```

### `[canisters.<name>.check-stable]`

Configure automatic stable variable compatibility checking for a canister. When set, [`mops check`](/cli/mops-check) will verify that the current canister is compatible with the deployed version.

| Field         | Description                                                     |
| ------------- | --------------------------------------------------------------- |
| path          | Path to the deployed version's `.most` or `.mo` file (required). A `.most` file is preferred; when a `.mo` file is provided, stable types are generated from it (the file must compile successfully) |
| skipIfMissing | If `true`, silently skip the stable check when the file doesn't exist (default: `false`) |

Example:
```toml
[canisters.backend.check-stable]
path = ".old/src/main.most"
skipIfMissing = true
```

### `[canisters.<name>.migrations]`

Configure managed enhanced orthogonal persistence migrations for a canister. When set, `mops check` and `mops build` auto-inject `--enhanced-migration` and you can use [`mops migrate`](/cli/mops-migrate) commands to manage the migration chain.

| Field       | Description                                                     |
| ----------- | --------------------------------------------------------------- |
| chain       | Path to the directory containing frozen migration files (required) |
| next        | Path to the staging directory for the next migration (required). Must contain 0 or 1 `.mo` files |
| check-limit | Max number of migrations to include when running `mops check` (optional). When set, only the last N migrations from the chain are used |
| build-limit | Max number of migrations to include when running `mops build` (optional). When set, only the last N migrations from the chain are used |

Example:
```toml
[canisters.backend.migrations]
chain = "migrations"
next = "next-migration"
check-limit = 1
build-limit = 100
```

Migration files must be named so they sort lexicographically in the correct order. The recommended naming convention is `YYYYMMDD_HHMMSS_Name.mo` (e.g. `20250415_120000_AddEmail.mo`).

:::note
When `[migrations]` is configured, do not add `--enhanced-migration` to `[canisters.<name>].args` — mops manages this flag automatically.
:::

Shorthand — when only the entrypoint is needed:
```toml
[canisters]
backend = "src/main.mo"
```


## [build]

Global build settings used by [`mops build`](/cli/mops-build).

| Field     | Description                                                     |
| --------- | --------------------------------------------------------------- |
| outputDir | Output directory for compiled Wasm and Candid files (default `.mops/.build`). Path is relative to `mops.toml`. The `--output` CLI flag takes precedence. |
| args      | Array of flags passed to `moc` for every canister build (e.g. `["--release", "--ai-errors"]`) |

Example:
```toml
[build]
outputDir = "dist"
args = ["--release", "--ai-errors"]
```

These flags are applied after `[moc].args` and before per-canister `[canisters.<name>].args`.


## [lint]

Settings for [`mops lint`](/cli/mops-lint).

| Field   | Description                                                                                                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| args    | Array of extra flags passed to `lintoko` (e.g. `["--severity", "warning"]`)                                                                                                        |
| rules   | Array of local rule directory paths to use (e.g. `["lint"]`). Overrides the default `lint/`/`lints/` directories when set.                                                         |
| extends | Pull in `rules/` directories from installed dependencies. Set to `true` to include all dependencies that ship rules, or to an array of package names (e.g. `["pkg"]`) to be selective. |

Example:
```toml
[lint]
args = ["--severity", "warning"]
rules = ["my-rules"]
extends = ["some-pkg"]
```

### [lint.extra]

Map file globs to additional rule directories. Each entry runs a separate `lintoko` invocation on the matched files, **in addition** to the base rules that always apply to all files.

| Key (glob) | Value (string array)                          |
| ---------- | --------------------------------------------- |
| File glob  | Array of rule directory paths to apply        |

Example:
```toml
[lint.extra]
"src/main.mo" = ["lint/no-types"]
"src/Types.mo" = ["lint/types-only"]
"migrations/*.mo" = ["lint/migration-only", "lint/no-types"]
```

Globs that match no files are skipped with a warning. All runs (base and extra) execute even when earlier runs find errors, so you see every failure in a single pass. The `--rules` CLI flag does not affect `[lint.extra]` entries.


## [requirements]

When a user installs your package(as a transitive dependency too), Mops will check if the requirements are met and display a warning if they are not.

Use only if your package will not work with older versions of the `moc`.

| Field                | Description                                      |
| -------------------- | ------------------------------------------------ |
| moc                  | Motoko compiler version  (e.g. `0.11.0` which means `>=0.11.0`)  |

## Advanced Configuration

For additional configuration options including registry endpoint overrides, see [Environment Variables](/cli/environment-variables).