# Mops CLI Changelog

## Next

- Fix `moc-wrapper` caching a failed compiler lookup. In a project with no `[toolchain] moc` and no `dfx` on `PATH`, it wrote an empty `.mops/moc-<host>-<hash>` file and then ran the empty string, so every later invocation failed with `--version: command not found` instead of naming the problem. It now leaves no cache entry when the lookup fails and reports `could not resolve moc`, pointing at `mops toolchain use moc <version>`. Projects that pin `[toolchain] moc`, and anyone with dfx installed, are unaffected.

## 3.0.0 (unreleased)

- **Breaking**: mops no longer invokes `dfx` for anything it does itself. `dfx` does not need to be installed.
  - The `dfx` and `dfx-pocket-ic` replicas are gone, and so is the `--replica` flag on `mops test` and `mops bench`. `mops test --mode replica`, `mops bench` and `mops watch --test` always run on PocketIC. Migration: drop `--replica dfx` / `--replica pocket-ic` from your commands; there is nothing to replace them with. Both were deprecated with a warning since 2.14.
  - The dfx-bundled `moc` fallback is gone. `mops build`, `check`, `check-stable`, `test`, `bench`, `docs`, `generate`, `sync` and `mops watch` resolve the compiler only from `[toolchain] moc`, and error naming the fix when it is unset instead of shelling out to `dfx cache show`. `mops toolchain bin --fallback` is removed (the flag, not the command). Migration: run `mops toolchain use moc <version>` once and commit `mops.toml`.
  - `mops init` no longer contacts the registry for a "default package set" keyed on your detected `dfx` version, so a fresh `mops.toml` has no `[dependencies]`. Migration: `mops add core` (or whatever you actually use).
  - **Benchmark baselines drift.** PocketIC and the dfx replica report different instruction and heap counts, so the first `mops bench --compare` after upgrading will show a large diff in any project that was implicitly using a dfx replica. This is a change of measuring instrument, not a regression. Re-record with `mops bench --save`.
  - `mops bench` no longer reads `profile` from `dfx.json`; benchmark canisters are always compiled `--release`. Projects with `"profile": "Debug"` in `dfx.json` were silently benchmarking debug builds.
- **Breaking**: mops no longer supports `dfx` in any way. The previous entry took dfx out of mops's own internals; this one removes the surface that existed to serve projects deploying with dfx.
  - `mops toolchain init` and `mops toolchain reset` are gone, and so is the `moc-wrapper` binary the published package used to install. Their only job was exporting `DFX_MOC_PATH=moc-wrapper` from your shell config so `dfx build` compiled with the `moc` pinned in `[toolchain]`.
  - **Read this if you deploy with dfx.** `mops sources` still works as a `dfx.json` packtool, so dfx keeps resolving mops dependencies. What no longer reaches dfx is the compiler: without the bridge, `dfx build` uses its own bundled `moc`, while `mops check` / `mops build` / `mops test` use your pinned one. Type-checking and deploying with two different compilers is a real hazard — a program that passes `mops check` can still fail to build, or build differently, under dfx. The supported path is [`icp`](https://js.icp.build/), whose Motoko recipe builds each canister by invoking `mops build`, so the pin propagates with nothing in between. If you stay on dfx, keep `DFX_MOC_PATH` pointing at a `moc` of your choosing yourself, and keep the dfx-bundled version in step with `[toolchain] moc`.
  - `mops watch --deploy` and `mops watch --generate` are removed. Both shelled out to `dfx` (`dfx ping` / `dfx canister create` / `dfx build` / `dfx canister install`, and `dfx generate`), and neither is being replaced: mops is not a deployment tool, and `dfx generate` emits JS/TS bindings, which mops has never produced. `mops watch` keeps error checking, warnings, formatting and `--test`. Migration: run `icp deploy` (or `dfx deploy`) in a second terminal.
  - `mops init` no longer writes `defaults.build.packtool` into a `dfx.json` it finds in the current directory — it now touches nothing outside your project's own files. Migration: add `"packtool": "mops sources"` under `defaults.build` by hand if you want it.
  - `mops sources` is unchanged, including its output byte-for-byte. It prints `--package` flags for the resolved dependency tree and has no opinion about who consumes them; only its description changed, from naming dfx to describing what it prints.
  - The `dfx` field in `[package]` is still rejected at publish (see the entry below). That is a migration error for a field v3 removed, not dfx support.
- **Breaking**: `dfx` is rejected in the `[package]` section of `mops.toml` at publish time with an error naming the field, and dropped from the config type. It was documentation-deprecated in 2.7, but no runtime warning ever shipped, so this is a hard break for anyone who still has the field. Migration: delete the `dfx = "..."` line from `[package]`.
- `pocket-ic` no longer has to be pinned. With no `[toolchain] pocket-ic` entry, `mops test --mode replica`, `mops bench` and `mops watch --test` download and run **`14.0.0`**. The default is a fixed constant compiled into the CLI, never a "latest" lookup, so a cache warmed ahead of time (`mops toolchain use pocket-ic <version>` in a Docker image build, say) keeps runtime completely off the network. Pinning is still recommended for reproducibility.
- **Breaking**: the legacy `pic-ic` PocketIC client is gone, and with it support for `[toolchain] pocket-ic` below `9.0.0`. Upstream `@dfinity/pic` is now the only client. A `< 9.0.0` pin fails with a message naming the fix rather than the opaque `BinTimeoutError` the client would otherwise produce. In practice only `4.0.0` and `9.0.0`+ ever worked: `pic-ic@0.5.4` speaks the `4.0.0` protocol only, so `5.x`–`8.x` pins already failed that way. Deprecated with a warning in 2.20. Migration: `mops toolchain use pocket-ic 14.0.0`. There is no upper bound — mops keeps no list of blessed `pocket-ic` versions, the same as for `moc`, `wasmtime` and `lintoko`, and `latest` still resolves to the actual latest.
- `@icp-sdk/core` upgraded from `4.0.2` to `5.4.0`, which is the major the bundled `@dfinity/pic` uses. mops was held on `4.x` because `5.x` makes update calls over the IC HTTP API `v3` synchronous-call endpoint, which the dfx replica does not serve; with that replica gone, both can share one copy. `dist/vendor/pic.mjs` no longer inlines a second `@icp-sdk/core` and shrinks from 1.15 MB to 600 KB. (#652)
  - Only affects `MOPS_NETWORK=local` / `MOPS_REGISTRY_HOST`: the replica you point mops at must serve `v3`. `icp` and recent `dfx` do. Nothing changes for the default `ic` network or for `staging`.

- Dependency resolution now compares versions with a real semver comparator instead of splitting on `.` and `parseInt`-ing the parts. Resolution semantics are unchanged — a bare `1.2.3` is still exact and conflicts still resolve to the root version or the highest one — but the edges the old comparator got wrong are fixed. It treated every prerelease as equal to its release and to every other prerelease of the same version, so a GitHub dependency pinned to `#v1.2.0-rc.1` by one package and `#v1.2.0` by another resolved to whichever was walked first, and `#v1.2.0-rc.2` vs `#v1.2.0-rc.10` was a coin flip. It also silently dropped the patch comparison for two-part versions (`0.16` compared equal to `0.16.1`, because `undefined - 1` is `NaN`), and read a prefixed tag like `#release-v1.2.0` as version `0.2.0`, which made it lose to any `1.x` tag. Registry versions are `x.y.z` (the registry validates that on publish), so nothing changes for them, and the CLI now matches the backend `Semver` module on that set — including leading zeros, which the registry accepts and where strict semver would have sorted `01.2.3` as `0.0.0` and silently downgraded it. Same comparator as `mops update` / `mops outdated`, which already used semver.
- **Breaking**: cross-major dependency conflicts are now reported by default, on every command that resolves dependencies (`mops install`, `build`, `test`, `sources`, …) rather than only where a caller opted in. Being handed a different major than a package declared changes the API it compiles against, so it must not happen quietly. It is a warning, not an error: resolution still succeeds. The report names every dependent, which version won — including when the root wins with a `path` or `repo` dependency and there is no version to name — and that pinning in your root `mops.toml` is how you choose something else. It goes to stderr, so `mops sources` output stays parseable as a dfx packtool. Dependencies that differ only in minor or patch version are still resolved silently, and only registry dependencies take part in a conflict — a `repo` or `path` dependency has no comparable major. A conflict reported once is not repeated by the later resolution passes within the same command. Resolution served from a valid `mops.lock` does not re-walk the graph, so the report appears on the run that produces or updates the lockfile. `mops watch` cannot surface the report yet: it redraws by clearing the terminal each cycle, which wipes the report immediately after it is printed.
- `mops sources --conflicts ignore` silences the conflict report for the whole command, not just the final resolve — use it in your `dfx.json` packtool if you have reviewed a cross-major conflict and decided to keep it, since `mops sources` otherwise reports it on every `dfx build`. `--conflicts error` still exits with a non-zero code, and now prints its own `Error!` line after the report instead of relabelling it. Other commands have no opt-out.
- **Breaking**: Node.js >= 20 is required (`engines` bump from >= 18); installs on Node 18 fail with an engines error. (#288)
- Removed legacy `mocv` detection: `mops toolchain init` no longer refuses to run when `mocv` is installed (and no longer strips mocv-era `DFX_MOC_PATH` lines from shell configs), and `mops docs` no longer resolves `mo-doc` from a mocv-managed `DFX_MOC_PATH`. Use `mops toolchain use moc <version>` to pin the compiler.
- **Breaking**: unknown flags before `--` are now rejected with an error instead of being silently swallowed as arguments (a mistyped flag like `mops check --nope` used to be treated as an ordinary argument, with confusing downstream errors or none at all). Applies to `build`, `check`, `check-stable`, `test`, `bench`, `generate candid` and `lint`. The `-- <tool flags>` passthrough is unaffected: `mops check -- -Werror`, `mops test -- -Werror`, `mops lint -- --severity warning` keep working. Migration: if a script passes a flag mops doesn't recognize, either drop it or move it after `--` if it was meant for the underlying tool.
- Fix `mops lint -- <lintoko flags>` failing with `too many arguments` (regression from the Commander 13 upgrade). `mops lint <filter> -- <lintoko flags>` works too.
- **Breaking**: `mops info <pkg> --versions` now lists versions newest-first (it was oldest-first), matching `mops toolchain info --versions`. Migration: scripts that took the last line to get the latest version (`... | tail -1`) should take the first (`... | head -1`).
- **Breaking**: `mops test` defaults to the `verbose` reporter for any number of test files (it used to switch to the `files` reporter when more than one file was found). Migration: pass `--reporter files` to get the old multi-file output.
- **Breaking**: `mops watch` without flags now runs only the safe informative set — error check, warning check and formatting — instead of "almost everything". Tests, declaration generation and deploys are opt-in: pass `--test` / `--generate` / `--deploy`. Formatting is now part of the default set; error checking remains always-on. Migration: passing any flag still selects only the named tasks, so reproduce the old default with `mops watch -wtgd` (add `-f` — `mops watch -wtgdf` — to also get the new formatting).
- `mops check` gets `--no-lint` to skip the automatic lint step for a single run when `lintoko` is pinned in `[toolchain]`. Projects without a `lintoko` pin are unaffected.
- **Breaking**: `mops set-network` and `mops get-network` are removed. Set the `MOPS_NETWORK` environment variable instead — `MOPS_NETWORK=local mops install` (or `staging`); with the variable unset, mops uses `ic`. The removed commands stored the choice in a file inside the installed CLI directory, which is frequently not writable (CI images, Docker, global installs owned by root) and, when it was, applied one project's choice to every project sharing that install and got wiped by the next `npm i -g ic-mops`. `MOPS_NETWORK` has been the documented way to select a network since 2.5.1 and works everywhere, so the file is gone rather than moved. Migration: replace `mops set-network <network>` with `export MOPS_NETWORK=<network>` (or set it per command); `mops get-network` has no replacement — read `$MOPS_NETWORK`.
- **Breaking**: added `--locked`, and removed the `--lock <check|update|ignore>` flag from `mops add`, `mops remove`, `mops install`, `mops sync` and `mops update`. There are now two modes and one flag: plain commands are the dev flow, `--locked` is the CI flow. (#516)
  - `--lock check` → `--locked`. Strictly stronger: it also refuses to write the lockfile, so a CI run can never mutate it. `--locked` fails when `mops.lock` is missing, unparseable, not the current format version, does not pin the dependencies declared in `mops.toml`, or records a file hash that disagrees with the registry. Available on `mops install` **and** on every command that installs dependencies implicitly (`mops build`, `mops check`, `mops check-candid`, `mops check-stable`, `mops test`, `mops bench`, `mops generate candid`), so a pipeline can run `mops test --locked` with no preceding install step. `mops sources` deliberately has none — the dfx packtool invokes it mid-build and machine-parses its stdout; put `mops install --locked` earlier in the pipeline instead.
  - `--lock update` → plain `mops install`, which is now **self-healing**: a missing, unparseable, legacy-format or `mops.toml`-inconsistent lockfile is regenerated instead of erroring, as is a lockfile still carrying absolute local `path` entries written by a pre-2.19.2 CLI. Nothing needs a flag to recover any more.
  - `--lock ignore` → no successor. The lockfile is always maintained (cargo's model). Its only remaining consumer was internal (`mops sources`), which still installs from the lock without writing it.
  - Note for anyone moving off `--lock check`: `--locked` requires the current lockfile format (version 3), whereas `--lock check` accepted and validated version 1 and 2 locks. A v1/v2 lock now fails `--locked` with a message telling you to run `mops install` once and commit the upgraded lock. Plain `mops install` has always rewritten v1/v2 locks to v3, so this only surfaces where the older lock was committed but never regenerated.
- **Breaking**: the `CI` environment variable no longer changes lockfile behavior. Setting `CI` used to switch `mops install` to check mode silently; that was deprecated with a warning in 2.18 and is now removed. CI jobs must pass `--locked` explicitly. (#516)
- **Breaking**: dependency integrity is now verified **at download time** instead of by re-hashing `.mops/` on every install. Each file is hashed as it arrives and compared against the hash published in the registry; the package is committed to the cache only if every file matches, so a corrupted or tampered download never reaches your project. Added `mops verify` for the full on-disk audit. (#517)
  - **Guarantee change, read this if you relied on it**: editing a file under `.mops/` no longer fails your next `mops install`, `mops build` or `mops test`. Installs are no longer a tamper gate for files already on disk. If a pipeline depended on that, run `mops verify` instead — it re-hashes every file the lockfile records, and additionally checks the lockfile against `mops.toml` and the registry. Packages already sitting in the global cache from an earlier CLI were never download-verified; `mops verify` audits them, and `mops cache clean` forces a verified re-download.
  - The removed re-hash was proportional to the whole dependency tree and paid on every install: ~136 ms for an 842-file / 33.5 MB tree on a warm local SSD (median warm `mops install` 1.75 s → 1.59 s), and proportionally worse on cold page cache, container overlays or networked filesystems.
  - `--locked` and `mops verify` do not re-walk the dependency graph from scratch. Installing from a lockfile deliberately skips the versions that lost a version conflict, so their manifests are never downloaded and a full re-resolve is not possible without giving up that optimization. Registry versions are immutable, so this is not a gap for them; transitive changes reached through a local `path` dependency are not detected.
- A download that fails its integrity check now aborts `mops build`, `mops check`, `mops check-candid`, `mops check-stable`, `mops test`, `mops bench` and `mops generate candid` with exit code 1. These commands previously discarded the install result and carried on against a partially-populated `.mops/`; the old `.mops/` re-hash happened to exit the process itself, which masked it.
- A `mops.lock` that is valid JSON but structurally wrong (missing or non-object `deps` / `hashes`) is now treated as corrupt — plain `mops install` regenerates it and `--locked` reports it — instead of failing with an unhandled `TypeError`.
- `mops install` also self-heals two lockfile inconsistencies it previously ignored: a `deps` entry that disagrees with the version declared in `mops.toml` (which used to be installed as-is, silently giving you the wrong version), and a `hashes` section whose packages do not match `deps`. Both are detected offline.
- Known limitation, by design: a `mops.lock` whose recorded file *hash values* are wrong (only reachable by hand-editing or a bad merge) is not repaired by `mops install`. Detecting it requires `getFileHashesByPackageIds`, an update call that costs ~1.2 s, and paying that on every install to catch a hand-edit would cost far more than the re-hash this release removes. Those values are consumed only by `--locked` and `mops verify`, never by the build, so a wrong hash cannot produce a wrong build. Both commands report it and tell you to restore `mops.lock` from version control or delete it and reinstall — the recovery that actually works.
- **Breaking (guidance)**: commit `mops.lock` — for libraries as well as applications. `mops.lock` no longer tells library authors to gitignore it. A library's lockfile has no effect on its consumers (they resolve their own graph), and it makes the library's own CI reproducible. If you have `mops.lock` in `.gitignore` because of the old advice, remove it.
- **Breaking**: Node.js >= 20 is required (`engines` bump from >= 18); installs on Node 18 fail with an engines error. (#288)
- Removed legacy `mocv` detection: `mops toolchain init` no longer refuses to run when `mocv` is installed (and no longer strips mocv-era `DFX_MOC_PATH` lines from shell configs), and `mops docs` no longer resolves `mo-doc` from a mocv-managed `DFX_MOC_PATH`. Use `mops toolchain use moc <version>` to pin the compiler.
- **Breaking**: the network selected with `mops set-network` is now stored per project (in `.mops/network`) instead of in a file inside the installed CLI, where it silently applied to every project sharing the same `ic-mops` install and was reset by npm upgrades. `mops set-network <network>` now writes the project-local setting; pass `--global` to store it in the mops config dir (`~/.config/mops` on Linux, `~/Library/Application Support/mops` on macOS) as a fallback for projects without one. Resolution order: `MOPS_NETWORK` env var, project-local, global, `ic`. Migration: you are affected only if the old file exists with a non-default value (i.e. you ran `mops set-network local|staging` and have not upgraded `ic-mops` since); mops keeps reading the legacy file as a last-resort fallback and prints a hint — run `mops set-network <network>` (or with `--global`) to migrate. The legacy file is no longer written. `mops cache clean` keeps the project's network selection (it empties `.mops/` of cached packages only).
- **Breaking**: `mops build`, `mops check`, `mops check-stable`, `mops check-candid`, `mops test`, `mops bench` and `mops generate candid` no longer silently ignore `mops.lock` when installing dependencies. They now follow the same lock flow as `mops install`: create or refresh the lock when it is stale, and accept `--locked`. `mops sources` (machine-parsed by the dfx packtool) still leaves the lock untouched.
- **Breaking**: `mops toolchain init` now updates only your current shell's config file (detected from `$SHELL`) instead of writing every detected file (`.bashrc`, `.zshrc`, `.bash_profile`, `.zprofile`). Pass `--shell <bash|zsh>` to target a specific shell; run once per shell if you use several. In GitHub Actions, `$GITHUB_ENV` is still written. `mops toolchain reset` keeps cleaning all known files, so it fully undoes inits made by older versions.
- **Breaking**: `mops test --mode replica --replica dfx` / `mops bench --replica dfx` exit with code `1` instead of `11` when the replica fails to bind its port.
- Remove vessel/dhall support (deprecated since 2.14). `mops init` no longer migrates `vessel.dhall` — copy your dependencies into `mops.toml` manually and delete `vessel.dhall` / `package-set.dhall`. GitHub dependencies (`repo = "..."`) are unaffected, but their transitive dependencies declared via `vessel.dhall` / `package-set.dhall` are no longer resolved or installed — add them to your own `mops.toml` if you need them. `.vessel` directories are no longer excluded from `mops test`/`watch` file scans, and the `dhall-to-json-cli` dependency is gone from the CLI.

## 2.20.0
- Fix `mops bench` (and `mops sync`, `mops watch`) ignoring `[toolchain] moc` and always resolving the compiler via `DFX_MOC_PATH` / `dfx cache show`, unlike `mops build`/`test`/`check`/`check-stable`/`generate`/`docs`. A pinned `[toolchain] moc` is now the compiler these commands invoke, regardless of `DFX_MOC_PATH`.
- `.tar.xz` toolchain archives (`lintoko`, `wasmtime`) are now unpacked with `tar` plus a standalone xz decompressor instead of `decompress` and its `decomp-tarxz` plugin. Extraction output is unchanged — same files, same permissions — but `decompress` is unmaintained, with two open critical advisories and no fixed version, so the toolchain download path no longer depends on it. Failures during unpacking now surface as errors instead of being swallowed and reported later as a missing-directory copy error, and the temporary download directory is always cleaned up. `decomp-tarxz` is no longer a runtime dependency of the published CLI.
- `mops publish --dry-run` runs the same local publish steps as a real publish (packaging checks, docs, changelog, tests, benchmarks) and prints the final file list, without contacting the registry or uploading. Honors `--no-docs` / `--no-test` / `--no-bench`. Does not run canister config validation or prove registry acceptance.
- Fix `mops publish` exiting 0 on keyword-length and invalid `package.files` path errors (now exit 1, same as other preflight failures).
- The PocketIC client used by `mops test --mode replica`, `mops bench`, and `mops watch` for `pocket-ic` `9.0.0` and newer is now upstream `@dfinity/pic` (`0.23.0`) instead of the `pic-js-mops` fork. The two patches mops needed — passing an explicit binary path and a server `--ttl` — landed upstream, so the fork no longer has a reason to exist and mops tracks PocketIC releases directly. No behavior change: the same toolchain-managed binary is started with the same `--ttl`. `@dfinity/pic` is a devDependency pre-bundled into the published CLI, because its postinstall downloads a ~94 MB pocket-ic binary and fails without network, and mops manages that binary itself via `[toolchain] pocket-ic`. That bundle carries pic's own `@icp-sdk/core` (`5.x`), so mops itself stays on `4.0.2`: `5.x` drops the IC HTTP API `v2` endpoints, which are the only ones the `dfx` and `dfx-pocket-ic` replicas serve, and projects with no `pocket-ic` pin still use those.
- `npm i -g ic-mops` downloads 1.4 MiB instead of 5.0 MiB. The published tarball used to ship the whole `cli/` directory, which meant two copies of the CLI: the `dist/` tree that the `mops` binary actually runs, and the 2.3 MiB bun single-file bundle that only `curl -fsSL cli.mops.one/install.sh | sh` uses. It also carried the TypeScript sources, the test suite and a second copy of `templates/`, `declarations/` and the Wasm helper that `dist/` already contains. Now only `dist/`, `bin/moc-wrapper.sh` and the changelog are published. Nothing changes for `cli.mops.one/install.sh`, which downloads the bundle from the releases canister, or for `mops self update`, which uses the same source.
- Deprecated `[toolchain] pocket-ic` pins below `9.0.0`. They still work — the legacy `pic-ic` client is unchanged and still handles them — but now print a warning, and support will be removed in mops v3. Run `mops toolchain use pocket-ic 12.0.0` to move to a supported version.

## 2.19.2

- Fix local path dependencies being written into `mops.lock` as absolute filesystem paths, which made committed lockfiles non-portable across machines. Local deps are now stored root-relative (e.g. `./packages/shared`, `../lib`). Regenerate an existing absolute lock with `mops install --lock update` (a plain `mops install` will not rewrite it). After regenerating, all environments need a CLI that includes this fix — older CLIs treat relative lock paths as cwd-relative and break from subdirectories.

## 2.19.1

- `mops user import` accepts identities in PKCS#8 format (`-----BEGIN PRIVATE KEY-----`, e.g. exported by icp-cli) in addition to the dfx-style SEC1 format, and validates the pem data at import time

## 2.19.0

- `[optimize]` runs Binaryen `wasm-opt` after `mops build` / `mops bench` (opt-in). Empty `[optimize]` defaults to `-O3 -g`. Pin via `[toolchain] wasm-opt` (Binaryen version, e.g. `131`); auto-pins latest if missing. Soft-fails to unoptimized Wasm on error.
- `mops build` and `mops bench` accept `--no-optimize` to skip the `[optimize]` `wasm-opt` post-pass for a single run without editing `mops.toml` (no-op when `[optimize]` is not set).

## 2.18.0

- `mops toolchain info <tool> --versions` lists stable GitHub release versions for a toolchain tool (moc, lintoko, wasmtime, pocket-ic), one per line, newest first. Defaults to the first releases page; pass `--all` for the full history (cache warming).
- `mops toolchain info <tool>` shows latest stable release, pinned version, and recent version history (first page only).
- Fix `mops install` under `CI=1` aborting on a stale `mops.lock` with no recovery path (AGE-291). The deps-hash mismatch error now suggests `mops install --lock update`. `mops add` / `remove` / `update` / `sync` always default to updating the lockfile even when `CI` is set (they never supported `--lock check`). Using `CI` to auto-select `--lock check` on `mops install` is deprecated and warns; pass `--lock check` explicitly. Removal tracked in `NEXT-MAJOR.md` (GH #516).

## 2.17.0

- `mops test` no longer passes `-S preview2=n` to wasmtime. The flag was deprecated in wasmtime 46 (printing a warning to stderr that was misread as a test failure) and became a hard error in wasmtime 47.0.0 (2026-07-20). moc emits WASI-preview1 modules, which wasmtime runs correctly without the flag.
- Fix `mops bench` accepting a `[moc] args` entry with an embedded space (e.g. `["-E=M0154 --legacy-persistence"]`) when it should reject it. `mops bench` now invokes `moc` with a proper argument array (same as `mops test`), so a mis-formatted entry produces the same error: `moc: invalid warning code: M0154 --legacy-persistence`.
- `mops test` and `mops bench` now support `-- <moc flags>` to pass extra flags directly to the Motoko compiler for that invocation (e.g. `mops test -- -Werror`), consistent with `mops build`, `mops check`, `mops check-stable`, `mops generate`, and `mops migrate`.

## 2.16.1

- Fix `mops bench` crashing on moc 0.15+ with the default `--gc copying`: `--copying-gc` is rejected under enhanced orthogonal persistence, which became the default persistence mode in 2.16.0. The default GC is now `incremental` (moc's default and the only collector available under EOP). Selecting a legacy collector (`copying`, `compacting`, `generational`) now implies `--legacy-persistence`, since moc only accepts them there.
- `mops build`, `mops check`, `mops generate`, and `mops check-stable` now tunnel `moc`'s exit code instead of always exiting `1`. moc exits `2` on a compiler crash (uncaught internal error) versus `1` for normal user errors (type/compile errors, stable-compat mismatch, bad args), so CI and scripts can now distinguish "file a Motoko bug" from "fix your code" via `$?`. `mops test` likewise exits `2` when a `moc` process crashes during a test run, instead of reporting it as an ordinary test failure.

## 2.16.0

- `mops bench` now compiles benchmark canisters under **enhanced orthogonal persistence** (moc's default) instead of forcing `--legacy-persistence` — measuring the persistence mode real canisters run. Pass `--legacy-persistence` to opt back into legacy persistence.
- `mops bench --query` measures each cell in a **query** call instead of an update call. Queries run no GC on the IC, so the instruction counts exclude GC work an update would incur — for benchmarking `query`/read-only workloads realistically. Only for synchronous benchmark runners (no inter-canister `await`).
- `[requirements].lintoko` declares a minimum lintoko version for package consumers. `mops install` (and `mops add`, `mops toolchain use`) warn when the project's lintoko is below a dependency's requirement, same as `moc` (#597).

## 2.15.2

- `mops check-stable` (and the stable check inside `mops check`) reports when `[canisters.<name>.migrations].check-limit` is set but more migrations are pending than the limit allows. If the compatibility check failed, the check-limit diagnostic replaces the misleading `moc` error; if it passed anyway, a warning is shown. Compares the deployed `.most` baseline against the local chain; use `--no-check-limit` to suppress.

## 2.15.1

- `mops check --fix` no longer aborts when a fixable file is read-only (e.g. a frozen migration chain file deliberately `chmod`'d to remove write access). The autofixer now skips such files with a warning and continues fixing the rest, instead of crashing the whole run on `EACCES`/`EPERM`.

- Load the PocketIC client lazily, only when a command actually starts a replica. Commands like `mops check`, `mops build`, and `mops install` no longer pay to load it (and its `@icp-sdk/core` dependency) at startup. This also unblocks running the CLI via `tsx` in local dev, where `pic-js-mops` (shipped as ESM without `"type": "module"`) fails to resolve as a static import.

- `mops bench --verbose` is now actually verbose. It prints the benchmark pipeline up front — compiler version, replica + version, GC, profile, and whether the wasm is optimized (`dfx` post-optimizes with `optimize: "cycles"` via ic-wasm on deploy; `pocket-ic` runs the raw `moc` output) — logs the full `moc` build command, and streams the compiler and `dfx` output instead of capturing and discarding it. Notably this surfaces dfx's `WARNING: Failed to optimize the Wasm module`, which dfx prints (and then silently deploys the unoptimized module) when `optimize: "cycles"` fails — e.g. on multi-value modules that the bundled ic-wasm can't process. Previously all of this was hidden even with `--verbose`.

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
