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
| candid   | Path to a Candid interface file (optional). `mops build` subtype-checks the generated interface against this file and embeds it into the wasm as `candid:service` metadata. `mops generate candid` writes the regenerated `.did` to this path. |
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
chain = "src/backend/migrations"

[canisters.frontend]
main = "src/frontend/main.mo"
```

### `[canisters.<name>.check-stable]`

Configure automatic stable variable compatibility checking for a canister. When set, [`mops check`](/cli/mops-check) will verify that the current canister is compatible with the deployed version.

| Field         | Description                                                     |
| ------------- | --------------------------------------------------------------- |
| path          | Path to the deployed version's `.most` or `.mo` file (required). A `.most` file is preferred; when a `.mo` file is provided, stable types are generated from it (the file must compile successfully) |

Example:
```toml
[canisters.backend.check-stable]
path = "deployed/backend.most"
```

For a new project with no prior deployment, run [`mops deployed init`](/cli/mops-deployed) — it commits an empty-actor `.most` at the configured path so the check passes against an empty baseline. After every successful deploy, run [`mops deployed`](/cli/mops-deployed) to promote the just-built `.most` into this file.

### `[canisters.<name>.migrations]`

Configure managed enhanced migration chains for a canister. When set, `mops check`, `mops build`, and `mops check-stable` auto-inject `--enhanced-migration` for the canister. Create migration files directly in the `chain` directory.

| Field       | Description                                                     |
| ----------- | --------------------------------------------------------------- |
| chain       | Path to the directory containing migration files (required) |
| check-limit | Max number of recent migrations to pass to `moc` during `mops check` and `mops check-stable`, and to `lintoko` during `mops lint` (optional). Useful when the chain grows long and re-checking every old migration slows feedback down. When set, the stable check warns if more migrations are pending (relative to the deployed `.most` baseline) than the limit allows. Override per run with `--no-check-limit` |
| next        | Path to the directory for a pending migration (optional, **experimental**). Required for the experimental [`mops migrate`](/cli/mops-migrate) workflow. Must contain 0 or 1 `.mo` files. Must share the same parent directory as `chain` |
| build-limit | Max number of recent migrations to pass to `moc` during `mops build` (optional, **experimental**) |

Example:
```toml
[canisters.backend.migrations]
chain = "migrations"
check-limit = 10
```

Migration files must be named so they sort lexicographically in the correct order. The recommended naming convention is `YYYYMMDD_HHMMSS_Name.mo` (e.g. `20250415_120000_AddEmail.mo`).

:::note
When `[migrations]` is configured, do not add `--enhanced-migration` to `[canisters.<name>].args` — mops manages this flag automatically.
:::

:::note
When chain trimming is active (or a `next` migration is configured), mops stages the active chain into `<parent-of-chain>/.migrations-<canister>/` for compilation. This keeps the staged files at the same depth as the originals so relative imports (e.g. a shared `types/` folder next to the chain) resolve identically. The staged dir self-stamps a `.gitignore`, and `mops init` adds `.migrations-*/` to the project `.gitignore`.

`moc` diagnostics may point to a staged path under `.migrations-<canister>/`, which mops removes when the command finishes.
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


## [deployed]

Settings for [`mops deployed`](/cli/mops-deployed).

| Field | Description                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------ |
| dir   | Directory where `mops deployed` writes promoted `.most` files (default `deployed`). Path is relative to `mops.toml`. Override per invocation with `--dir`. |

Example:
```toml
[deployed]
dir = "deployed"
```

All canisters share one directory; per-canister overrides are not supported.


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