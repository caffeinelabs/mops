# Mops CLI Changelog

## Next

- **Installs self-heal on transient network failures.** A `fetch failed`, `ECONNRESET` or `EMFILE` during an install no longer aborts the command: the install retries up to twice with the request concurrency halved, so an environment that cannot sustain the default parallelism degrades to a slower install instead of a broken one. Packages that already downloaded come from the cache on retry, and only the failures are re-fetched. Registry answers such as "Package not found" are never retried.
- The default request concurrency is now capped by the file-descriptor soft limit as well as the CPU count, so a many-core machine with a low `ulimit -n` no longer gets a budget wide enough to exhaust its own descriptors. The usual limits (macOS's default 256 and up) leave the budget unchanged.
- `mops update` now exits `2` for an unknown package or a missing `mops.toml`, matching `mops outdated`. It previously exited `0` after printing `Package "<name>" is not installed!`, so a typo in a scripted update looked like success.
- `mops update` and `mops outdated` now share one rule for deciding when a `repo = "..."` dependency is out of date, so the two commands cannot disagree about it.
- `mops update --help` and its doc page now state that the command rewrites `mops.toml` — it is `cargo upgrade` semantics, not `cargo update` — and list its exit codes.
- `mops.lock` is now written with all keys sorted — dependencies, packages, per-file hashes, graph entries and GitHub entries — so unrelated installs no longer produce diff churn or spurious merge conflicts. The lockfile format is unchanged: an existing lockfile with unsorted keys stays valid, still passes `mops install --locked`, and is reordered only the next time something legitimately updates it.
- `mops install` no longer crashes with a raw `RangeError: Maximum call stack size exceeded` when two local `path` dependencies require each other, or when one requires itself. The install walk now skips a local package it has already visited in the same run, naming neither a cycle nor an error — the packages install normally.
- Fixed `mops remove <pkg>` crashing with `Invalid dependency value ""` when the dependency is a local path dep.
- `mops remove` now echoes the dependency value it removed for GitHub and local path deps, instead of an empty version.
- Temporary compatibility shim: `mops add`, `remove`, `install`, `sync` and `update` again accept the removed 2.x flag `--lock <check|update|ignore>` instead of failing to parse. The value is ignored — including `check`, which is **not** treated as `--locked` — so v2 call sites keep working during the 3.x rollout. Migrate to `mops install --locked` for CI enforcement; the flag will be removed.

### Performance

- `mops install` now runs the API compatibility check concurrently with the install instead of before it, removing a registry round trip (~110 ms) from every install. The check's outcome is unchanged — an incompatible CLI still errors and skips the toolchain install — but the error now surfaces after the packages have installed. `mops publish` deliberately keeps the check serial, since publishing writes immutable registry state.
- **Parallel package installs.** Packages now download through a bounded pool instead of one at a time, sharing a fixed request budget so the package pool and the per-package file downloads cannot multiply (a cold install of 8 root packages plus transitives measured 19.7 s → 13.2 s). Branches of the graph requesting the same package share one download. New `mops install --concurrency <n>` flag and `MOPS_CONCURRENCY` environment variable cap simultaneous registry requests; the env var covers every command that installs packages. The default derives from the CPU count (2 × cores, clamped to 4–16 — the same mechanism pnpm uses for `network-concurrency`). The undocumented heuristic that quietly capped download threads whenever `GITHUB_ENV` was set is removed: it detected a brand, not a constraint.
- Writing a downloaded package's files to disk and copying packages from the global cache into `.mops/` now run through bounded pools instead of unbounded fan-outs, so a large dependency graph can no longer exhaust file descriptors.
- **Faster CLI startup.** The agent no longer eagerly synchronises time on every invocation, which cost three `read_state` requests against the ICP ledger canister — a canister mops never otherwise talks to, on a different subnet. Clock skew still self-heals: the agent re-syncs against the mops canister and retries once when a replica rejects an expired ingress expiry.
- **Install telemetry no longer blocks.** `notifyInstalls` is submitted as an ingress message and acknowledged on acceptance instead of waiting for a certified reply (~125 ms rather than ~1.1 s). Delivery is unchanged — the method is `oneway` and never had a stronger guarantee.
- Together those remove roughly 1.5 s of fixed cost from a warm-cache `mops install && mops update` in a fresh directory, none of it dependent on how many packages a project has.
- File metadata and the first chunk of each file are now fetched concurrently rather than chained, halving per-file round trips for the single-chunk case that covers essentially every Motoko source file.
- Chunk concatenation is no longer quadratic. **Breaking for programmatic consumers of the `ic-mops` package**: `downloadFile` and `downloadPackageFiles` now return `Uint8Array` instead of `Array<number>`.
- `mops outdated` and `mops update` no longer make a registry call when a project has no registry dependencies to check.
- **Dependency resolution runs once per command instead of three to five times.** A command resolves at several points (local cache sync, lockfile write, requirements check, `mops sources`), each of which used to re-walk the whole dependency graph. The walk is now memoized in-process on the *content* of `mops.toml` and `mops.lock` plus every local `path` dependency manifest it reads, so a command that rewrites its own inputs — `mops install` writing the lockfile, `mops add` writing `mops.toml` — still re-walks and cannot act on a stale graph. A caller arriving while a walk is still in flight shares it and re-checks the local manifests once it settles, so the memo also cannot serve a stale graph under concurrent resolution — the door parallel installs opened.

### Integrity

- **`mops.lock` is now a trust anchor on the install path.** When the lockfile already covers a package being downloaded, its bytes are verified against the hashes recorded there — a local, committed record — so no registry call is needed at all. A clean clone with a committed lock and a cold cache therefore makes **no** consensus call, where previously it made one per package (~1.2–2.5 s each, each blocking the next). This is the model cargo uses with `Cargo.lock`.
- When the lockfile cannot answer — no lock, a stale one, a package new to the lock, or a version that lost a conflict — the registry's consensus reply is used, as before, and always before the bytes are staged into the cache. Verification is therefore always against either a committed local record or a subnet-agreed one, at the moment of admission, regardless of which command is installing.
- Registry file hashes are fetched at most once per process, so a package downloaded during an install costs nothing further when the lockfile is written.
- A hash mismatch now names its source. If the expectation came from `mops.lock`, the message says so and points at restoring or regenerating the lockfile, rather than suggesting a retry that cannot succeed.
- **GitHub dependencies are now covered by the lockfile.** `mops.lock` records the resolved commit and a content hash for every `repo = "..."` dependency, and an install verifies the fetched archive against them before it enters the cache. A ref carrying no commit — a bare `#main`, or a tag — is resolved once and pinned, so a moved tag or a force-push can no longer silently change what you build; the archive is always fetched by commit, never by ref. `mops verify` audits GitHub dependencies on disk too. This is **not** a lockfile format bump: the record is an optional `github` section, so projects without GitHub dependencies keep their existing lockfile. A lockfile written by an older CLI **for a project that has one** counts as stale — `mops install` regenerates it, and `--locked` fails until the result is committed. Note GitHub dependencies are often transitive, so this can apply to a project whose own `mops.toml` declares none.
- **Behaviour change**: plain `mops install` now fails when it has to _download_ a package whose hashes disagree with the committed lockfile. It remains true that files already on disk under `.mops/` are not re-hashed by an install — `mops verify` is still the command that audits those.

### Fixed

- **A local `path` dependency's own `mops.toml` no longer goes unnoticed.** Adding or bumping a dependency inside a local package left `mops.lock` judged fresh, so `mops install` exited 0, installed nothing, and never passed the new dependency to the compiler — the package then failed to build against a dependency mops had reported as installed. `mops.lock` now records a hash of the `[dependencies]` of every path dependency it reaches, transitively, so editing any of them makes the lockfile stale.
- **Changing `MOPS_ENV` no longer leaves `mops.lock` pinned to the previous environment.** `{MOPS_ENV}` paths are stored expanded in the lockfile, but the freshness check compared the unexpanded string, so a full `mops install` under a new environment exited 0 and kept building against the old environment's directories. `mops install` now re-resolves, `mops sources` reports the current environment, and `mops install --locked` fails rather than silently using the wrong paths. Note that a committed lockfile now only satisfies `--locked` for the `MOPS_ENV` it was generated under.
- **Breaking**: only the winning versions and their own dependencies are installed. When two versions of a package were in the graph, the resolver picked a winner but still walked the loser's manifest into the result, so a package declared _only_ by the version that lost was downloaded, written to `mops.lock`, and passed to `moc` as `--package`. Cargo and pnpm install the closure of the winners. If a project was compiling against such a package without declaring it, that build now fails with an unresolved import — add the dependency to `mops.toml`. Dependency edges for losing versions are still recorded in the lockfile, so regenerating a lock does not need those versions back on disk.
- **`mops outdated` is now usable as a CI gate.** It exited `0` whether or not anything was outdated. It now exits `1` when updates are available and `2` when the check itself could not be completed (no `mops.toml`, unknown package, registry or GitHub lookup error), so a partial report can never be mistaken for a clean bill of health. `1` for "found something" matches `npm outdated` and `pnpm outdated`.
- **`mops outdated` and `mops update` no longer disagree.** `outdated` skipped GitHub dependencies while `mops update` updates them, so it could print "All dependencies are up to date!" for a project where `mops update` would rewrite a GitHub pin. GitHub dependencies whose branch has moved past the pinned commit are now reported, using the same rule `mops update` applies.
- `mops add <pkg> --dev` now **moves** an existing `[dependencies]` entry into `[dev-dependencies]` instead of declaring the package twice; a plain `mops add <pkg>` moves it back.
- `mops remove <pkg>` now finds the package in whichever section declares it, so removing a dev-only dependency no longer requires `--dev`. When both sections declare it, both entries go; `--dev` still removes only the dev entry.
- `mops add org/repo` is accepted as a GitHub shorthand instead of crashing with an unhandled `ERR_INVALID_URL`. An argument that is neither a package name, a GitHub repo nor a local path now fails with a message naming the accepted forms, and a failed repo lookup prints an error rather than a stack trace.
- `mops add <pkg>@<version>` no longer collapses an existing pinned alias such as `"map@8.1.0" = "8.1.0"` into the bare package key. Replacing a declared version is now reported, along with the pinned alias to add if both versions should be kept.
- `mops add` and `mops remove` now name the affected section in their output.
- **`mops sync` no longer destroys a pinned alias dependency.** Given `map = "9.0.1"` and `"map@8.1.0" = "8.1.0"`, sync compared imports (`map@8.1.0`) against alias-stripped manifest keys (`map`), so it reported the alias as both missing and unused — adding it overwrote `map` with `8.1.0`, and a single run could remove the dependency entirely. Aliases are now matched verbatim and added under their own key.
- `mops sync` adds packages imported only from `test`, `tests`, `bench` or `benchmark` directories to `[dev-dependencies]` rather than `[dependencies]`. Already-declared packages are never moved between sections.
- `mops sync` removes an unused package from **both** sections when it is declared in both; previously it was only removed from `[dependencies]`, leaving a dangling entry that the next run reported again.
- `mops sync` is roughly twice as fast — it runs `moc --print-deps` once per file instead of twice.
- `mops remove --dry-run` is now side-effect free. It no longer deletes local cache directories or rewrites a stale `mops.lock`, and it prints `Would remove package …` instead of reporting the removal as done.
- **`mops cache clean` works on Windows and on non-`ic` networks.** Its safety guard compared a `path.join` result against a forward-slash suffix, so it failed with "Invalid cache directory" on every Windows run and for every network-scoped cache directory. The replacement is separator-agnostic and strictly narrower: it also requires the directory to be inside the global cache root, rejecting a traversing `MOPS_NETWORK`.
- `mops cache clean` no longer deletes `./.mops` when run outside a project, where an empty root directory made it target the current working directory.

### Added

- `mops outdated [pkg]` accepts a package name, matching `mops update [pkg]`.
- `mops sync --dry-run` prints what would be added and removed without touching `mops.toml`, the local cache or `mops.lock`.
- `mops cache clean --global` cleans only the global cache and keeps the project's `.mops` directory.
- `mops.lock` gains an optional `localDepsHash` field, written only for projects that declare a local `path` dependency. Those projects have their lockfile regenerated once on the next `mops install`, and `mops install --locked` fails until the regenerated lockfile is committed. Projects without path dependencies are unaffected — the field is omitted entirely and existing lockfiles stay valid.

## 3.0.0 (unreleased)

### Migrating from 2.x

Everything that requires action, in one list. Details in the themed sections below.

- **Pin a compiler**: `mops toolchain use moc <version>`, commit `mops.toml`. Every command that compiles now requires the pin — there is no dfx fallback.
- **If you deploy with dfx**: delete the `export DFX_MOC_PATH=moc-wrapper` line from your shell config (`dfx build` fails outright while it points at the removed binary), then read [dfx support is removed](#dfx-support-is-removed) — your dfx builds no longer use the pinned compiler.
- **Drop `--replica dfx` / `--replica pocket-ic`** from `mops test` / `mops bench` — the flag is gone, PocketIC is always used. Re-record benchmark baselines with `mops bench --save`.
- **`[toolchain] pocket-ic` below `9.0.0`**: run `mops toolchain use pocket-ic 14.0.0`.
- **If you use `[optimize]`**: pin Binaryen with `mops toolchain use wasm-opt <version>` and commit it. Builds no longer pin one for you, and a `wasm-opt` failure now fails the build.
- **CI pipelines**: replace `--lock check` and the `CI` env-var behavior with an explicit `--locked` flag; it is accepted by `mops install` and every command that installs implicitly.
- **Replace `mops set-network <net>`** with the `MOPS_NETWORK` environment variable.
- **`mops watch`**: drop `-g` / `-d` (removed); no flags now means error + warning + format, `--test` is opt-in.
- **Scripts parsing `mops info <pkg> --versions`**: take the first line for the latest version, not the last.
- **Node.js >= 20** is required.
- **Commit `mops.lock`** — libraries too; remove it from `.gitignore` if the old advice put it there.
- **Publishing**: delete the `dfx = "..."` line from `[package]` if you still have one.
- **Vessel users**: `mops init` no longer migrates `vessel.dhall` — copy dependencies into `mops.toml` by hand.

### dfx support is removed

mops neither invokes dfx nor supports projects that deploy with it. `dfx` does not need to be installed, and nothing mops does reaches it.

- The `dfx` and `dfx-pocket-ic` replicas are gone, and with them the `--replica` flag on `mops test` and `mops bench` (deprecated since 2.14). PocketIC is always used.
- The dfx-bundled `moc` fallback is gone. `mops build`, `check`, `check-stable`, `test`, `bench`, `docs`, `generate`, `sync` and `mops watch` resolve the compiler only from `[toolchain] moc` and error naming the fix when it is unset. `mops toolchain bin --fallback` is removed (the flag, not the command).
- `mops toolchain init` and `mops toolchain reset` are gone, along with the `moc-wrapper` binary. Their job was exporting `DFX_MOC_PATH=moc-wrapper` so `dfx build` compiled with the pinned `moc`. **If you deploy with dfx, this is the entry to read**: `mops sources` still works as a `dfx.json` packtool, so dfx keeps resolving your mops dependencies — but `dfx build` now uses its own bundled compiler while `mops check` / `build` / `test` use your pinned one, and a program that passes `mops check` can build differently, or not at all, under dfx. In GitHub Actions the same applies silently: `mops install` / `mops sources` no longer write `DFX_MOC_PATH` into `$GITHUB_ENV`, so such a workflow stays green while compiling with a different `moc`. The supported path is [`icp`](https://js.icp.build/), whose Motoko recipe builds by invoking `mops build`, so the pin propagates. If you stay on dfx, set `DFX_MOC_PATH` yourself and keep it in step with `[toolchain] moc`.
- `mops watch --deploy` and `mops watch --generate` are removed, not replaced: mops is not a deployment tool, and `dfx generate` emits JS/TS bindings mops has never produced. Flag bundles fail loudly — `mops watch -tgd` errors with `unknown option '-gd'`; use `mops watch -t`. To deploy or regenerate declarations on change, run `icp deploy` / `icp-bindgen` (or the dfx equivalents) in a second terminal.
- `mops init` no longer contacts the registry for a dfx-versioned "default package set" (a fresh `mops.toml` has no `[dependencies]` — `mops add core` yourself) and no longer writes `defaults.build.packtool` into a `dfx.json` it finds. It touches nothing outside your project's own files.
- `mops bench` no longer reads `profile` from `dfx.json`; benchmark canisters are always compiled `--release`. Projects with `"profile": "Debug"` were silently benchmarking debug builds.
- **Benchmark baselines drift**: PocketIC and the dfx replica report different instruction and heap counts, so the first `mops bench --compare` after upgrading shows a large diff wherever a dfx replica was implicitly in use. Change of measuring instrument, not a regression — re-record with `mops bench --save`.
- The `dfx` field in `[package]` is rejected at publish with an error naming the field (documentation-deprecated since 2.7, but no runtime warning ever shipped). Delete the line.
- `mops sources` is unchanged, byte-for-byte, including its stdout. It prints `--package` flags and has no opinion about who consumes them.

### PocketIC and toolchain

- `pocket-ic` no longer has to be pinned: with no `[toolchain]` entry, `mops test --mode replica`, `mops bench` and `mops watch --test` download and run **`14.0.0`**. The default is a fixed constant compiled into the CLI, never a "latest" lookup, so a cache warmed ahead of time (e.g. `mops toolchain use pocket-ic <version>` during a Docker image build) keeps runtime completely off the network. Pinning is still recommended for reproducibility.
- **Breaking**: the legacy `pic-ic` PocketIC client is gone, and with it `[toolchain] pocket-ic` pins below `9.0.0` (deprecated in 2.20). Migration: `mops toolchain use pocket-ic 14.0.0`. A `< 9.0.0` pin fails with a message naming that fix rather than an opaque `BinTimeoutError` — which is all `5.x`–`8.x` pins ever produced anyway, since `pic-ic` spoke only the `4.0.0` protocol. There is no upper bound: mops keeps no list of blessed `pocket-ic` versions, same as for `moc`, `wasmtime` and `lintoko`.
- `@icp-sdk/core` upgraded from `4.0.2` to `5.4.0` (#652). Only affects `MOPS_NETWORK=local` / `MOPS_REGISTRY_HOST`: update calls now use the IC HTTP API `v3` endpoint, so the replica you point mops at must serve it — `icp` and recent `dfx` do. Nothing changes for the default `ic` network or `staging`. `dist/vendor/pic.mjs` no longer inlines a second copy and shrinks from 1.15 MB to 600 KB.
- Removed legacy `mocv` detection: `mops docs` no longer resolves `mo-doc` from a mocv-managed `DFX_MOC_PATH`. Use `mops toolchain use moc <version>`.
- **Breaking**: `[optimize]` requires a `[toolchain] wasm-opt` pin. Previously, a project with `[optimize]` and no pin had its `mops.toml` **rewritten by the next `mops build` or `mops bench`**, with the version chosen by a "latest release" lookup at build time. That is two things a build should never do — mutate checked-in source, and depend on the network to decide what it compiles with — and it made the build unreproducible by construction, since the same commit built before and after a Binaryen release produced different artifacts. Build commands now fail before compiling and name the fix (`mops toolchain use wasm-opt <version>`). This closes the last runtime "latest" lookup on the build path, matching the guarantee already made for `moc` and `pocket-ic`.
- **Breaking**: a `wasm-opt` failure fails the build instead of warning and keeping the unoptimized module. `[optimize]` is a property of the artifact you asked for, so quietly substituting a different one left no signal for anything downstream that hashes, certifies or deploys it — and the warning was easy to miss in CI logs that scroll. `--no-optimize` still skips the pass deliberately, and `--verbose` still prints full `wasm-opt` output.

### Lockfile and integrity

- **Breaking**: `--locked` replaces `--lock <check|update|ignore>`, which is removed from `mops add`, `remove`, `install`, `sync` and `update` (#516). Two modes, one flag: plain commands are the dev flow, `--locked` is the CI flow.
  - `--lock check` → `--locked`. Strictly stronger: it also refuses to write the lockfile, so a CI run can never mutate it. Fails when `mops.lock` is missing, unparseable, not the current format version, does not pin what `mops.toml` declares, or records a file hash the registry disagrees with. Accepted by `mops install` **and** every implicitly-installing command (`build`, `check`, `check-candid`, `check-stable`, `test`, `bench`, `generate candid`), so a pipeline can run `mops test --locked` with no install step. `mops sources` deliberately has no `--locked` (machine-parsed mid-build) — put `mops install --locked` earlier in the pipeline.
  - `--lock update` → plain `mops install`, now **self-healing**: a missing, unparseable, legacy-format or `mops.toml`-inconsistent lockfile is regenerated instead of erroring, as is one carrying absolute local `path` entries from a pre-2.19.2 CLI.
  - `--lock ignore` → no successor; the lockfile is always maintained (cargo model).
  - Note when moving off `--lock check`: `--locked` requires the current format (v3), while `--lock check` accepted v1/v2. A committed v1/v2 lock fails `--locked` with a message saying to run `mops install` once and commit the upgrade.
- **Breaking**: the `CI` environment variable no longer switches `mops install` to check mode (deprecated in 2.18). Pass `--locked` explicitly. (#516)
- **Breaking**: integrity is verified **at download time** instead of by re-hashing `.mops/` on every install (#517). Files are hashed as they arrive and compared against the registry before the package is committed to the cache, so a corrupted download never reaches your project.
  - **Guarantee change**: editing a file under `.mops/` no longer fails your next install/build/test — installs are not a tamper gate for files already on disk. If a pipeline relied on that, run the new `mops verify`: it re-hashes every file the lockfile records and checks the lock against `mops.toml` and the registry. Packages cached by an earlier CLI were never download-verified; `mops verify` audits them, `mops cache clean` forces a verified re-download. Neither `--locked` nor `mops verify` re-walks the dependency graph from scratch — registry versions are immutable so that is not a gap for them, but transitive changes reached through a local `path` dependency are not detected.
  - The removed re-hash was paid on every install, proportional to the whole tree (~136 ms for an 842-file tree on a warm SSD, worse on cold caches or networked filesystems).
- **Breaking**: `mops build`, `check`, `check-candid`, `check-stable`, `test`, `bench` and `generate candid` no longer silently ignore `mops.lock` when installing implicitly — they follow the same lock flow as `mops install`, and a download that fails its integrity check aborts them with exit code 1 (previously they carried on against a partially-populated `.mops/`).
- `mops install` also self-heals what it previously ignored: a structurally-wrong lock (missing/non-object `deps` or `hashes`) is regenerated instead of throwing a `TypeError`; a `deps` entry that disagrees with `mops.toml` (previously installed as-is — the wrong version, silently) and a `hashes` section inconsistent with `deps` are both detected offline and repaired.
- Known limitation, by design: hand-edited file _hash values_ in `mops.lock` are not repaired by `mops install` — detecting them costs a ~1.2 s registry call that would outweigh the re-hash this release removes. They are consumed only by `--locked` and `mops verify` (never by the build), and both report the mismatch with the recovery that works: restore `mops.lock` from version control, or delete and reinstall.
- **Breaking (guidance)**: commit `mops.lock`, for libraries as well as applications. A library's lock has no effect on consumers (they resolve their own graph) and makes the library's own CI reproducible. The old gitignore advice is gone from the `mops.lock created.` message and the docs.
- `mops.lock` records the declared dependencies of every registry package version in the graph (`graph` section), including versions that lost a conflict. Regenerating a stale lock (`mops add`/`remove`/`update`/`sync`, or after editing `mops.toml`) resolves from these recorded edges instead of reading manifests of packages that were never installed. This closes the crash where those commands died with a raw `ENOENT: ... mops.toml` after a lock-driven install on a graph with version conflicts; with a pre-graph lock the missing manifests are now downloaded on demand instead of crashing. Locks without `graph` keep working; older CLIs ignore the field.
- Regenerating a stale lock no longer refetches file hashes for the whole graph: hashes of already-locked packages are carried over (published versions are immutable), and only packages new to the lock are queried. `mops remove` updates the lock without any registry queries. Deleting `mops.lock` remains the way to rebuild every hash from the registry.
- Fixes for incomplete global-cache state: a cache entry counts as cached only if it is complete (empty leftover directories from interrupted runs are deleted and re-downloaded instead of being treated as hits), packages missing from the global cache are re-downloaded when syncing `.mops`, and the advisory `moc`/`lintoko` requirements check falls back to the global cache instead of crashing on a manifest missing from `.mops/`.
- `mops.lock` is written atomically (staged temp file + rename), so a concurrent `mops install` can no longer read a half-written lock and crash with `Unexpected end of JSON input`.

### Dependency resolution

- Version comparison uses a real semver comparator instead of `parseInt` on dot-split parts. Semantics are unchanged — bare `1.2.3` is still exact, conflicts still resolve to the root version or the highest — but the broken edges are fixed: prereleases no longer compare equal to their release (`#v1.2.0-rc.1` vs `#v1.2.0` resolved to whichever was walked first) or to each other (`rc.2` vs `rc.10` was a coin flip), two-part versions no longer drop the patch comparison (`0.16` equalled `0.16.1`), and a prefixed tag like `#release-v1.2.0` no longer parses as `0.2.0`. Registry versions are validated `x.y.z` at publish, so nothing changes for them; the CLI now matches the backend `Semver` module on that set, including leading zeros.
- **Breaking**: cross-major dependency conflicts are reported by default on every resolving command (`mops install`, `build`, `test`, `sources`, …). A different major than a package declared changes the API it compiles against, so it must not happen quietly. It is a warning — resolution still succeeds. The report names every dependent, which version won, and that pinning in your root `mops.toml` is how you choose otherwise; it goes to stderr, so `mops sources` stdout stays machine-parseable. Minor/patch skew stays silent, and only registry dependencies take part — `repo` / `path` deps have no comparable major. Resolution served from a valid `mops.lock` does not re-walk the graph, so the report appears on the run that produces or updates the lock. (`mops watch` cannot surface it yet: its redraw clears the terminal.)
- `mops sources --conflicts ignore` silences the report for the whole command — pass it where your build tool invokes `mops sources` after you have reviewed a conflict and decided to keep it. `--conflicts error` still exits non-zero. Other commands have no opt-out.

### Defaults and CLI strictness

- **Breaking**: unknown flags before `--` are rejected with an error instead of silently swallowed as arguments (a mistyped `mops check --nope` used to be treated as an ordinary argument). Applies to `build`, `check`, `check-stable`, `test`, `bench`, `generate candid` and `lint`. The `-- <tool flags>` passthrough is unaffected: `mops check -- -Werror`, `mops lint -- --severity warning` keep working.
- **Breaking**: `mops watch` without flags runs the safe informative set — error check, warning check, formatting — instead of "almost everything"; `--test` is opt-in. Passing any flag still selects only the named tasks.
- **Breaking**: `mops test` defaults to the `verbose` reporter for any number of files. Pass `--reporter files` for the old multi-file output.
- **Breaking**: `mops info <pkg> --versions` lists newest-first, matching `mops toolchain info --versions`. Scripts that took the last line (`| tail -1`) should take the first (`| head -1`).
- `mops check` gets `--no-lint` to skip the automatic lint step for one run when `lintoko` is pinned. Projects without a pin are unaffected.
- Fix `mops lint -- <lintoko flags>` failing with `too many arguments` (Commander 13 regression). `mops lint <filter> -- <lintoko flags>` works too.

### Removals

- **Breaking**: `mops set-network` and `mops get-network` are removed. Use the `MOPS_NETWORK` environment variable — `MOPS_NETWORK=local mops install` (or `staging`); unset means `ic`. The removed commands stored the choice in a file inside the installed CLI directory: frequently not writable (CI, Docker, root-owned globals), shared across every project on the machine, and wiped by the next `npm i -g ic-mops`. `MOPS_NETWORK` has been the documented mechanism since 2.5.1. `mops get-network` has no replacement — read `$MOPS_NETWORK`.
- Remove vessel/dhall support (deprecated since 2.14). `mops init` no longer migrates `vessel.dhall` — copy dependencies into `mops.toml` and delete `vessel.dhall` / `package-set.dhall`. GitHub dependencies (`repo = "..."`) are unaffected, but transitives they declare via vessel files are no longer resolved — add what you need to your own `mops.toml`. `.vessel` directories are no longer excluded from `mops test`/`watch` scans, and the `dhall-to-json-cli` dependency is gone.

### Runtime

- **Breaking**: Node.js >= 20 is required (`engines` bump from >= 18); installs on Node 18 fail with an engines error. (#288)

## 2.21.0

- Security: GitHub dependencies (`repo = "..."`) are now extracted with a purpose-built unzipper instead of the `decompress` package, which has two unfixed advisories ([GHSA-mp2f-45pm-3cg9](https://github.com/advisories/GHSA-mp2f-45pm-3cg9), [GHSA-h39j-r5qq-r9mm](https://github.com/advisories/GHSA-h39j-r5qq-r9mm)) allowing a malicious archive to write files outside the install directory. Entries that would escape the target directory now fail the whole extraction, and symlinks are written as plain files instead of being created. `npm audit` on the CLI is clean again. One behavior change: a GitHub dependency whose repo contains symlinks gets those as regular files holding the link target.
- `mops self update` no longer crosses major versions on its own, since a new major contains breaking changes. It prints the release-notes link and asks for confirmation in a terminal; in non-interactive environments it skips the update with a notice and exits successfully, so scripted updates keep working and stay on their major. Pass `--major` to update across majors. Updates within the same major are unchanged.
- Add opt-in static Wasm analysis with `mops build --check-wasm` and `[build].check-wasm = true`, independently controlled from PocketIC deployment checks. It analyzes the final Wasm and reports stable, actionable `MOPS-WASM-COMPLEXITY` diagnostics, including the three largest per-function contributors. Complexity from 750,000 emits an early warning and from 900,000 a critical warning. Use `--no-check-wasm` to skip configured analysis for one build. The estimate never fails the build; PocketIC remains authoritative for IC0505 and IC0539 validation.
- Add `mops build --check-deploy` and `[build].check-deploy = true` to install built Wasm files on fresh PocketIC canisters and fail on deployment or initialization errors. Use `--no-check-deploy` to skip configured validation for one build. PocketIC 9.0.0 or newer, or a local PocketIC binary path, is required. Per-canister `wasmMemoryLimit` settings are applied during deployment checks, and every command that resolves canisters rejects non-positive or non-integer limits. PocketIC errors are reported as provided by the client. Installation failures are collected across canisters before the command fails. Before installation, Mops asks `moc --stable-compatible` whether each generated `.most` is reachable from a temporary empty-actor baseline. Incompatible canisters are reported as `MOPS-CHECK-DEPLOY-SKIPPED` with the compiler diagnostic; eligible siblings are still checked. The PocketIC client is loaded only when deployment checking is enabled.
- Mark `dist/bin/mops.js` as executable in the published package, so the `mops` binary works with package managers that preserve file modes from the tarball.
- Fix `moc-wrapper` caching a failed compiler lookup. In a project with no `[toolchain] moc` and no `dfx` on `PATH`, it wrote an empty `.mops/moc-<host>-<hash>` file and then ran the empty string, so every later invocation failed with `--version: command not found` instead of naming the problem. It now leaves no cache entry when the lookup fails and reports `could not resolve moc`, pointing at `mops toolchain use moc <version>`. Projects that pin `[toolchain] moc`, and anyone with dfx installed, are unaffected.

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
- `mops watch` now includes all \*.mo files
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
- Removed legacy folders migration code. If you are using Mops CLI `<= 0.21.0`, you need first to run `npm i -g ic-mops@0.45.3` to migrate your legacy folders. After that, you can run `mops self update` to update your Mops CLI to the latest version.
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
