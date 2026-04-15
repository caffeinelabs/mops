# Mops CLI Changelog

## Next
- Add `mops migrate new <Name>` and `mops migrate freeze` commands for managing enhanced migration chains
- Add `[canisters.<name>.migrations]` config section with `chain`, `next`, `check-limit`, and `build-limit` fields
- `mops check`, `mops build`, and `mops check-stable` now auto-inject `--enhanced-migration` when `[migrations]` is configured
- `mops check` and `mops check-stable` emit a hint to create a migration when a stable compatibility check fails and `[migrations]` is configured
- Migration chain trimming: only the last N migrations are passed to `moc` based on `check-limit`/`build-limit` settings

## 2.10.0
- `mops check` and `mops check-stable` now apply per-canister `[canisters.<name>].args` (previously only `mops build` applied them)
- `mops check` now accepts canister names as arguments (e.g. `mops check backend`) to check a specific canister
- `mops check-stable` now works without arguments, checking all canisters with `[check-stable]` configured
- `mops check-stable` now accepts canister names as arguments (e.g. `mops check-stable backend`)

## 2.9.0
- Add `mops info <pkg>` command to show detailed package metadata from the registry
- Add `[lint.extra]` config for applying additional lint rules to specific files via glob patterns

## 2.8.1

- Fix `mops check-stable` failing when `[moc] args` contains flags with relative paths (e.g. `--actor-idl=system-idl`)

## 2.8.0

- `mops build` now generates a `.most` (Motoko stable types) file alongside `.wasm` and `.did` for each canister; the `.most` file can be passed directly to `mops check-stable` to verify upgrade compatibility
- `mops.lock` is now created automatically the first time dependencies are installed — no need to run `mops i --lock update` once to opt in. Triggered by `mops install`, `mops add`, `mops remove`, `mops update`, `mops sync`, and `mops init` (when it installs dependencies). Applications should commit `mops.lock`; library authors should add it to `.gitignore`.

## 2.7.0

- `mops publish` no longer requires a `repository` field — it is now optional metadata (used by the registry UI for source links)
- `mops publish` now hard-errors on GitHub `[dependencies]` instead of prompting; the backend has rejected them for some time and the prompt was misleading
- `mops publish` now fails fast with a clear error when unsupported fields (`dfx`, `moc`, `homepage`, `documentation`, `donation`) are set in `mops.toml`
- Fix `mops publish` reporting incorrect max length for `license` field (was 30, now matches backend limit of 40)

## 2.6.0

- Packages can ship lintoko rules for consumers in a `rules/` directory (distinct from `lint/`/`lints/` which check the package itself); `rules/*.toml` files are included automatically when running `mops publish`
- Add `[lint] extends` in `mops.toml` to pull in `rules/` from installed dependencies: `extends = ["pkg"]` for named packages or `extends = true` for all
- Add `[lint] rules` in `mops.toml` to override the default `lint/`/`lints/` rule directories with custom paths
- `mops check` now runs `mops lint` after a successful type-check when `lintoko` is pinned in `[toolchain]`; lint is scoped to explicitly passed files when given, otherwise covers all `.mo` files; `--fix` propagates to both steps
- Raise package file limit from 300 to 1000; `mops publish` now fails fast with a clear error if the limit is exceeded
- Fix `mops docs coverage` crashing with out-of-memory on packages with many source files (replaced JSDOM with a lightweight adoc parser)

## 2.5.1
- Fix `mops test` and `mops watch` breaking when dependency paths contain spaces
- Fix `mops sync` incorrectly reporting version-pinned dependencies as missing/unused
- Fix `mops update --lock ignore` not respecting the lock option during intermediate installs
- Fix `mops update` crashing with unhandled error when GitHub API is unavailable
- Fix `mops add` writing dependency to config even when GitHub download fails
- Fix GitHub dependency install crashing the entire process instead of reporting the error
- Fix version comparison treating short version strings (e.g. `1.0`) as equal to longer ones (e.g. `1.0.5`)
- Fix `mops remove` not cleaning up transitive dependencies of GitHub packages
- Fix corrupted `mops.lock` file causing an unhandled crash instead of a helpful error message
- Fix `mops sources` resolving package config from wrong directory in some contexts
- Harden lock file integrity check against package ID prefix collisions
- `mops build` now reports invalid canister names instead of silently ignoring them
- Document `baseDir`, `readme`, and `dfx` fields in `[package]` config

## 2.5.0
- Add support for `MOPS_REGISTRY_HOST` and `MOPS_REGISTRY_CANISTER_ID` environment variables for custom registry endpoints
- Fix `mops build` crashing with `__wbindgen_malloc` error in bundled CLI distribution
- Fix `parallel()` swallowing errors from concurrent tasks (e.g. `mops publish` uploads), which could hang or leave failures unreported

## 2.4.0
- Support `[build].outputDir` config in `mops.toml` for custom build output directory
- Fix `mops build --output` CLI option being silently ignored
- Warn when canister `args` contain flags managed by `mops build` (e.g. `-o`, `-c`, `--idl`)
- Support pocket-ic versions beyond 9.x.x (fixes #410)

## 2.3.2
- Fix `mops check`, `mops build`, and `mops check-stable` failing to find canister entrypoints when run from a subdirectory

## 2.3.1
- Fix `mops build` and `mops check-candid` failing with "Wasm bindings have not been set" when installed via `npm i -g ic-mops`

## 2.3.0
- Add `mops check-stable` command for stable variable compatibility checking
- `mops check` now falls back to canister entrypoints from `mops.toml` when no files are specified
- `mops check` automatically runs stable compatibility when `[canisters.<name>.check-stable]` is configured
- `mops check --fix` now behaves like fix + `mops check` — reports changed files, then type-checks and runs stable compatibility if configured
- `skipIfMissing` in `[canisters.<name>.check-stable]` silently skips when the file doesn't exist
- Add docs for `mops lint`, `mops moc-args`, `[canisters]`, `[build]`, and `[lint]` config sections
- Add docs canister deployment step to release process

## 2.2.1
- Fix `mops toolchain` when toolchain version is a local file path with subdirectories.
- Update Motoko formatter (`prettier-plugin-motoko`).

## 2.2.0
- Add `[moc]` config section for global `moc` compiler flags (applied to `check`, `build`, `test`, `bench`, `watch`)
- Add `mops moc-args` command to print global `moc` flags from `[moc]` config section
- Fix `mops check --fix` crash on overlapping diagnostic edits (e.g., nested function calls)

## 2.1.0
- Add `mops check --fix` subcommand (for Motoko files) with autofix logic
- Add `mops check` subcommand for type-checking Motoko files
- Warn for `dfx` projects instead of requiring `mops toolchain init`
- Allow specifying toolchain file paths in `mops.toml`
- Add `mops lint` subcommand and `lintoko` toolchain management
- Improve bench-canister Bench type to be less restrictive (by @timohanke)

## 2.0.1
- Patch vulnerability in `tar` dependency

# 2.0.0
- `mops publish` add support for subheadings in changelog (by @f0i)
- `mops toolchain` now downloads `moc.js` in addition to `moc` binary
- New `mops build` subcommand (alternative to `dfx build`)
- `core` package used in place of `base` for benchmarks

## 1.12.0
- Add pinned dependencies support to `mops update` and `mops outdated` commands
- Add support for pocket-ic v9
- Migrate from `@dfinity/*` packages to `@icp-sdk/core` package
- `mops test` now runs replica tests sequentially

## 1.11.1
- Fix `Cannot find module 'simple-cbor'` error

## 1.11.0
- Fix `mops bench` to work with moc >= 0.15.0
- `mops test` now detects persistent actor to run in replica mode
- `mops watch` now includes all *.mo files
- Update `@dfinity` packages to v3
- Create agent with `shouldSyncTime` flag
- Show user-friendly error message for invalid identity password

## 1.10.0
- Enable `memory64` for `wasi` testing (by @ggreif)
- Add support for arm64 `moc` binaries (for `moc` >= 0.14.6)
- Deploy benchmarks with `optimize: "cycles"` dfx setting
- Show warning when publishing packages with GitHub dependencies

## 1.9.0
- Add `mops docs generate` command for generating package documentation ([docs](https://docs.mops.one/cli/mops-docs-generate))
- Add `mops docs coverage` command for analyzing documentation coverage ([docs](https://docs.mops.one/cli/mops-docs-coverage))

## 1.8.1
- Exclude `node_modules` from publish command file patterns

## 1.8.0
- Add `mops format` command for formatting Motoko source files with Prettier and Motoko plugin ([docs](https://docs.mops.one/cli/mops-format))
- Add `--format` flag to `mops watch` command to enable automatic formatting during watch mode ([docs](https://docs.mops.one/cli/mops-watch#--format))

## 1.7.2
- Fix replica termination in `mops test` command

## 1.7.1
- Fix `mops install` for local dependencies

## 1.7.0
- Add support for `actor class` detection to run replica tests in `mops test` command

## 1.6.1
- Fix `mops i` alias for `mops install` command (was broken in 1.3.0)

## 1.6.0
- Add support for `.bash_profile` and `.zprofile` files to `mops toolchain init` command

## 1.5.1
- Collapsible output of `mops bench` in a CI environment
- Fix regression in `mops bench` without `dfx.json` file (by @rvanasa)

## 1.5.0
- Compile benchmarks with `--release` flag by default
- Respect `profile` field in `dfx.json` for benchmarks

## 1.4.0
- Update `mops bench` command output:
  - Print only final results if benchmarks run in a CI environment or there is no vertical space to progressively print the results
  - Hide "Stable Memory" table if it has no data
  - Hide verbose output when running in a CI environment ("Starting replica...", "Running simple.bench.mo...", etc.)
  - Add LaTeX colors to the diffs when running in a CI environment with `--compare` flag
- CLI now fails if excess arguments are passed to it

## 1.3.0
- Show error on `mops install <pkg>` command. Use `mops add <pkg>` instead.
- Added support for pocket-ic replica that comes with dfx in `mops bench` command. To activate it, remove `pocket-ic` from `mops.toml` and run `mops bench --replica pocket-ic`. Requires dfx 0.24.1 or higher.
- `mops init` now pre-fills package name with current directory name in kebab-case
- Updated non-major npm dependencies

## 1.2.0
- Removed `mops transfer-ownership` command
- Added `mops owner` command to manage package owners ([docs](https://docs.mops.one/cli/mops-owner))
- Added `mops maintainer` command to manage package maintainers ([docs](https://docs.mops.one/cli/mops-maintainer))
- Added experimental support for pocket-ic replica that comes with dfx in `mops test` command ([docs](https://docs.mops.one/cli/mops-test#--replica))
- Added flag `--verbose` to `mops test` command to show replica logs
- Fixed bug where `mops watch` would fail if dfx.json did not exist
- Fixed bug with local dependencies without `mops.toml` file

## 1.1.2
- Fixed `{MOPS_ENV}` substitution in local package path

## 1.1.1
- `moc-wrapper` now adds hostname to the moc path cache(`.mops/moc-*` filename) to avoid errors when running in Dev Containers
- `mops watch` now deploys canisters with the `--yes` flag to skip data loss confirmation

## 1.1.0
- New `mops watch` command to check for syntax errors, show warnings, run tests, generate declarations and deploy canisters ([docs](https://docs.mops.one/cli/mops-watch))
- New flag `--no-toolchain` in `mops install` command to skip toolchain installation
- New lock file format v3 ([docs](https://docs.mops.one/mops.lock))
- Faster `mops install` from lock file when lock file is up-to-date and there are no cached packages
- Fixed replica test hanging in watch mode bug
- Fixed mops failing when dfx is not installed
- Fixed `mops test` Github Action template

## 1.0.1
- Fixed `mops user *` commands

## 1.0.0
- `mops cache clean` now cleans local cache too (`.mops` folder)
- Conflicting dependencies are now reported on `mops add/install/sources`
- New `--conflicts <action>` option in `mops sources` command ([docs](https://docs.mops.one/cli/mops-sources#--conflicts))
- New "Stable Memory" and "Garbage Collection" metrics are now reported in the `mops bench` command
- `mops test` command now supports `replica` mode for running actor tests ([docs](https://docs.mops.one/cli/mops-test#--mode))
- New `--replica` option in `mops test` command
- Updated npm dependencies
- Fixed bug with GitHub dependency with branch name containing `/`

**Breaking changes**:
- Default replica in `mops bench` and `mops test` commands now is `pocket-ic` if `pocket-ic` is specified in `mops.toml` in `[toolchain]` section and `dfx` otherwise
- The only supported version of `pocket-ic` is `4.0.0`
- Dropped support for `wasmtime` version `< 14.0.0`
- Default reporter in `mops test` command is now `files` if test file count is > 1 and `verbose` otherwise.
- Renamed `mops import-identity` command to `mops user import`
- Renamed `mops whoami` command to `mops user get-principal`
- Removed the ability to install a specific package with `mops install <pkg>` command. Use `mops add <pkg>` instead.
- Removed legacy folders migration code. If you are using Mops CLI  `<= 0.21.0`, you need first to run `npm i -g ic-mops@0.45.3` to migrate your legacy folders. After that, you can run `mops self update` to update your Mops CLI to the latest version.
- Removed `--verbose` flag from `mops sources` command

## 0.45.3
- Fixed bug with missing `tar` package

## 0.45.2
- Updated npm dependencies

## 0.45.0
- Updated npm dependencies
- Added `--no-install` flag to `mops sources` command
- Added `--verbose` flag to `mops publish` command
- Added support for [dependency version pinning](https://docs.mops.one/dependency-version-pinning)
- Suppress hashing tool detecting error in `moc-wrapper.sh` on Linux
- Fixed `moc-wrapper` error when no `.mops` folder exists
- Fixed cache folder delete on github install error

## 0.44.1
- Fixed fallback to dfx moc if there is no mops.toml

## 0.44.0
- Optimized `moc` toolchain resolving (~30% faster builds)

## 0.43.0
- Add `mops cache show` command
- Fix github legacy deps install

## 0.42.1
- Fix package requirements check from subdirectories
- Fix local and global cache inconsistency

## 0.42.0
- Package requirements support ([docs](https://docs.mops.one/mops.toml#requirements))
- Refactor `mops install` command
- Reduce install threads to 12 (was 16)
- Reduce install threads to 6 when install called from `mops sources`
- Install dependencies directly to global cache, copy to local cache only final resolved dependencies

## 0.41.1
- Fix bin path for npm

## 0.41.0
- Add `mops self update` command to update the CLI to the latest version
- Add `mops self uninstall` command to uninstall the CLI

## 0.40.0
- Publish package benchmarks