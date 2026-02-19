# Mops CLI Changelog

## Next
- Add `mops check` subcommand (for Motoko files)
- Warn for `dfx` projects instead of requiring `mops toolchain init`
- Allow specifying toolchain file paths in `mops.toml`
- Add `mops lint` subcommand and `lintoko` toolchain management

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