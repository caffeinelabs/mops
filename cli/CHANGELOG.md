# Mops CLI Changelog

## Next

## 2.15.0

- Fix `mops check --fix` corrupting source on lines containing multi-byte UTF-8 characters (e.g. `Char.toNat32('京')` dropping its trailing `)`). The autofixer was feeding moc's UTF-8 byte columns into LSP's UTF-16 position API, mis-applying every edit past the first non-ASCII byte on the line. When moc emits `byte_start`/`byte_end` (1.10.0 and newer) the fixer now applies edits byte-accurately; older moc still falls back to the line+column path (unchanged behavior, still ASCII-only).

- Revert "Speed up `mops check <files...>`" (2.14.1). Passing all files to a single `moc --check` invocation accumulates scope across them: checking `A.mo B.mo` makes `A.mo`'s definitions visible while type-checking `B.mo`, so a file that only compiles because a sibling brings something into scope is wrongly reported as passing. `mops check` again checks each file in its own `moc` invocation so every file is validated in isolation.

- Add `--no-check-limit` to `mops check`, `mops check-stable`, and `mops lint` to process the full migration chain for a single run, ignoring the configured `[canisters.<name>.migrations].check-limit`. Handy for `mops check --fix --no-check-limit` to autofix issues in older migrations that the limit normally skips

- `--help` now lists every option and the `-- <tool flags>` passthrough for each command: `mops build`, `mops check`, `mops check-stable`, and `mops generate candid` document `-- <moc flags>` (e.g. `mops check -- -Werror`), `mops lint` documents `-- <lintoko flags>`, and the `--verbose` flag of `mops add`/`mops install`/`mops publish` now has a description instead of showing blank

- Add `mops deployed` (post-deploy hook) and `mops deployed init` (one-time bootstrap). After a successful deploy, `mops deployed [canisters...]` promotes the built `<build-dir>/<name>.most` into `<deployed-dir>/<name>.most` so `mops check-stable` always compares against the just-deployed version. `mops deployed init` creates an empty-actor `.most` baseline and wires `[canisters.<name>.check-stable].path` to it. Configurable via `[deployed].dir` (default `deployed`) and overridable with `--dir`; the build output dir it reads from defaults to `[build].outputDir` (`.mops/.build`) and is overridable with `--build-dir`.

- Add `mops generate candid [canisters...]` to (re)generate the curated `.did` file from current Motoko source. With `[canisters.<name>].candid` set, overwrites that file in place; otherwise writes `<name>.did` next to `main` and sets the field in `mops.toml`. `--output, -o <path>` writes to an arbitrary path (single-canister only) without modifying `mops.toml`. `moc` is invoked with the same packages, `[moc].args`, `[build].args`, per-canister `args`, and migration flags as `mops build`, so the generated interface always satisfies `mops build`'s subtype check.

## 2.14.1
- Speed up `mops check <files...>` (e.g. `mops check src/**/*.mo`) on packages with many files. Previously each file was checked in its own `moc` invocation, so every shared transitive import was re-parsed and re-type-checked once per file. All files are now passed to a single `moc --check` call, which loads and type-checks each import only once — on motoko-core (53 files) this drops a full check from ~27s to ~1.6s. The per-file `✓` confirmations now print only when the whole check passes.

## 2.14.0
- Fix `mops check --fix` crashing with `TypeError: Cannot read properties of undefined (reading 'split')` when `moc` produces no output (e.g. it fails to spawn or is killed by the OOM killer in a memory-constrained container). The autofix pass now treats missing `moc` output as "no fixes to apply" and lets the regular check report the real failure, instead of aborting the whole command with an unhandled exception.

- Fix `mops check --fix` and `mops lint --fix` corrupting source files when two `mops` processes run concurrently in the same project (e.g. two coding agents on the same checkout). Concurrent runs could apply stale `moc` byte offsets to a sibling's already-mutated file, leaving source like `let nat = identity` (with the type-arg and call dropped) or `list.sortInPlace(` with an unclosed paren. `--fix` invocations now acquire a project-root advisory lock at `.mops/fix.lock` and serialize, cargo-style ("Waiting for another `mops --fix` run to finish..."). Read-only `mops check` and `mops lint` are unchanged.

- Deprecate the `dfx` replica in `mops bench`, `mops test --mode replica`, and `mops watch`. Behavior is unchanged — `--replica dfx`, the implicit `dfx` fallback when no `[toolchain.pocket-ic]` is set, and the dfx-bundled PocketIC fallback all still work — but each now prints a warning. Run `mops toolchain use pocket-ic <version>` to silence it. The `dfx` paths will be removed and the default flipped to PocketIC in mops v3 — `dfx` is being deprecated upstream and PocketIC is a better fit for benchmarks and replica tests (deterministic, in-process, no background daemon).

- `mops toolchain --help` now lists the tools mops manages (`moc`, `wasmtime`, `pocket-ic`, `lintoko`) in the top-level description instead of only mentioning them under `bin`, and `mops toolchain use` / `update` / `bin` print the available tools (via the auto-generated help) when invoked with a missing or invalid `<tool>` argument.

- Add `--patch` to `mops update` and `mops outdated` to restrict updates to patch versions only (e.g. `1.2.3 -> 1.2.4`, never `1.2.3 -> 1.3.0`). Mutually exclusive with `--major`. For pre-1.0 packages this matches the default — caret already restricts `0.x.y` to patch updates. Useful for risk-averse upgrades on packages that have hit 1.0+.

- Improve the per-file integrity-check error after `mops install --lock update`. Previously the message told users to run `mops install --lock update` — the exact command that just failed. After a regenerated lockfile, the only way a per-file hash can still mismatch is a local edit under `.mops/`, so the message now says that and suggests restoring from the global cache (delete the `.mops/<pkg>` directory and run `mops install`) or using a `repo`/`path` entry in `mops.toml` to keep custom changes.

- Deprecate the `vessel.dhall` auto-migration in `mops init`. Behavior is unchanged for now — interactive `mops init` still reads `vessel.dhall` and copies its dependencies into `mops.toml` — but a warning is printed (also under `--yes`, which still skips the migration itself), and the migration will be removed in mops v3. Before then, copy your dependencies into `mops.toml` manually and delete `vessel.dhall` / `package-set.dhall`.

- Fix `mops install` race conditions when multiple processes install into the same project (e.g. an editor watcher, fixture installers like vscode-motoko's, or CI matrix jobs sharing a global cache). Concurrent runs could observe a half-populated global cache or local `.mops/<pkg>` directory and copy zero-byte / truncated files, surfacing later as missing completions, hover data, or type-check errors. Cache writes (mops registry, GitHub installs, and project-local `.mops/`) now stage into a sibling `.staging-*` dir and atomically rename onto the canonical path. Stale staging dirs from interrupted runs are swept on the next install. The shared `.mops/_tmp/` zip download dir used by GitHub installs is also per-invocation now. If you have zero-byte files left over in your cache from a pre-fix crash, run `mops cache clean` once after upgrading.

- Replace `@iarna/toml` with `smol-toml` for parsing and writing `mops.toml` (faster, actively maintained, spec-compliant TOML parser). Config reformat behavior on `add`/`remove`/`bump`/`toolchain` is unchanged — both libraries round-trip through a plain object.

## 2.13.2
- Fix race conditions when two `mops` processes run on the same project (e.g. an editor watcher and `caffeine check --fix`, or back-to-back invocations). `mops check-stable` used a shared `.mops/.check-stable/` scratch dir and `mops check`/`build`/`check-stable` used a shared `<parent>/.migrations-<canister>/` staging dir; concurrent runs would clobber each other and surface as misleading errors like `.mops/.check-stable/new.most: No such file or directory` or `EEXIST: file already exists, symlink ...`. Both directories are now per-invocation (created via `mkdtemp` and removed when the command finishes).
- Deprecate `skipIfMissing` in `[canisters.<name>.check-stable]`. Behavior is unchanged for now, but `mops check`/`check-stable` print a warning when it is set. For initial deployments, commit a `.most` file at the configured `path` containing an empty actor (`// Version: 1.0.0\nactor { };`) instead — the stable check then runs against an empty baseline.
- Drop the "you may need a migration" hint after a failed stable compatibility check in `mops check`/`check-stable`. The hint guessed at whether the user needed a new migration or a fix to an existing one, and `moc`'s underlying compatibility error already links to the migration docs.
- The missing-chain-directory error from `mops check`/`build`/`check-stable` now points at adding a `.mo` file to the `chain` directory instead of running the experimental `mops migrate new <Name>` command.

## 2.13.1
- `mops lint` now honors `[canisters.<name>.migrations].check-limit`, skipping trimmed chain migrations so projects with large migration histories lint as fast as they type-check. Pass an explicit filter (`mops lint <name>`) to opt back in for a one-off lint of a trimmed file.

## 2.13.0
- Fix `mops update` and `mops outdated` jumping across major versions (or pre-1.0 minor versions) — they are now caret-bound by default, matching `cargo update`. For example, `core = "2.0.0"` now updates within `2.x.y` instead of jumping to a future `3.0.0`. Use `--major` to opt into cross-major updates.

## 2.12.3
- Fix `mops install --lock update` silently no-op'ing on a corrupt lockfile (#515)
- `mops publish` no longer rejects unknown `mops.toml` sections, `package.*` keys, or `requirements.*` entries — these typo guards were the only place in the CLI that complained about unknown keys, drifted from the docs/types, and blocked publish on harmless local-only config like `[moc]`, `[canisters]`, `[build]`, and `[lint]` (#512)

## 2.12.2
- Fix `mops install` (and any `--lock check` flow) failing with "Mismatched number of resolved packages" when a project's resolved dependencies include multiple aliases (e.g. `base`, `base@0`, `base@0.16`) that pin to the same `name@version`

## 2.12.1
- `mops check`/`build`/`check-stable` skip migration staging when only the pending `next` migration is needed, so `moc` diagnostics reference the real `next-migration/<file>` path.

## 2.12.0
- Migration staging directory moved from `.mops/.migrations/<canister>/` to `<parent-of-chain>/.migrations-<canister>/`, so migration files can import shared modules from sibling folders (e.g. a `types/` folder next to `migrations/`) — relative imports now resolve to the same target whether moc reads the original chain dir or the staged one. The staged dir self-stamps a `.gitignore` so it doesn't pollute `git status`; `mops init` now also adds `.migrations-*/` to the project `.gitignore`
- `[canisters.<name>.migrations]` now requires `chain` and `next` to share the same parent directory (any layout where the parents differed is rejected with a clear error). The default layout `chain = "migrations"` + `next = "next-migration"` already satisfies this. For per-canister setups, use sibling subdirectories, e.g. `chain = "src/backend/migrations"` + `next = "src/backend/next-migration"`

## 2.11.0
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