---
name: mops-cli
description: Manage Motoko projects with the mops CLI — toolchain pinning, dependency management, type-checking, building, and linting. Use when working with mops.toml, mops.lock, running mops commands, adding/removing packages, pinning moc or lintoko versions, checking or building canisters, configuring moc flags, or setting up a new Motoko project.
---

# Mops CLI

Opinionated guide for Motoko projects. Covers project config, dependency management, type-checking, building, and linting.

## Key Principles

1. **No dfx** — always pin `moc` in `[toolchain]`. Use the newest `moc` version. Pin `pocket-ic` too if you have replica tests or benchmarks (otherwise `mops test --mode replica`, `mops bench`, and `mops watch` fall back to the deprecated dfx replica and print a warning).
2. **No `mo:base`** — it is deprecated. Always use `mo:core` (`import Array "mo:core/Array"`).
3. **All config in `mops.toml`** — canisters, moc flags, toolchain versions, build settings.
4. **Canister-centric workflow** — define all canisters in `[canisters]`; never pass file paths to `mops check`. Exception: library packages (no `[canisters]`) use file paths directly: `mops check src/**/*.mo`.

## Project Setup

### Minimal `mops.toml`

```toml
[toolchain]
moc = "1.7.0"
lintoko = "0.10.0"
pocket-ic = "12.0.0"  # only if you have replica tests / benchmarks

[dependencies]
core = "2.5.0"

[moc]
args = ["--default-persistent-actors", "-W=M0223,M0236,M0237"]

[canisters.backend]
main = "src/backend/main.mo"

[canisters.backend.migrations]
chain = "src/backend/migrations"
check-limit = 10   # optional — speeds up `mops check` when the chain gets long

[canisters.backend.check-stable]
path = "deployed/backend.most"

[build]
outputDir = "src/backend/dist"
args = ["--release"]

# Opt-in Wasm optimization (Binaryen wasm-opt) for build + bench
[optimize]
# level = "O3"       # default
# keep-names = true  # default
# wasm-opt pin: [toolchain] wasm-opt = "131" (auto-pinned to latest if missing)
```

`check-stable` runs ICP's upgrade-time stable-variable compatibility check locally, so incompatible changes fail in `mops check` instead of being rejected when upgrading a live canister. It compares the current code against a `.most` from the deployed version.

Bootstrap that `.most`: new project → `mops deployed init` (empty-actor baseline); already-deployed canister → build from the deployed commit, then `mops deployed`. After every deploy, run `mops deployed` to promote the just-built `.most` (see [`mops deployed`](#mops-deployed) below).

Optional canister fields: `candid` (path to .did for compatibility checking), `initArg` (Candid-encoded init args).

### Warning Flags

`-W=M0223,M0236,M0237` — redundant type instantiation (M0223), suggest contextual dot notation (M0236), suggest redundant explicit arguments (M0237). These are allowed (disabled) by default; `-W=` enables them as warnings.

### Moc Args Layering

Flags are applied in this order (later overrides earlier):

1. `[moc].args` — global, all commands (check, build, test, bench, etc.)
2. `[build].args` — build only (e.g. `--release`)
3. `[canisters.<name>.migrations]` — auto-injected `--enhanced-migration` (managed by mops)
4. `[canisters.<name>].args` — per-canister
5. CLI `-- <flags>` — one-off overrides; supported by `mops check`, `mops build`, `mops check-stable`, `mops generate`, `mops migrate`, `mops test`, and `mops bench`

## Core Commands

### `mops install`

```bash
mops install
mops install --lock update   # regenerate a stale/corrupt mops.lock
mops install --lock check    # fail if lockfile is missing or stale (CI)
```

Run after cloning or after manual `mops.toml` edits. Updates `mops.lock` by default. Local path dependencies are stored root-relative in the lockfile (portable across machines). A plain install will not rewrite absolute paths left by older CLIs — use `mops install --lock update`, and ensure every environment has a CLI that understands relative lock paths.

When the `CI` env var is set and `--lock` is omitted, defaults to `--lock check` (deprecated — pass `--lock check` explicitly; auto-detection will be removed in v3). A stale lock fails with a hint to run `mops install --lock update`.

### `mops add <package>`

```bash
mops add core             # latest version
mops add core@2.5.0       # specific version
mops add --dev test       # dev dependency
```

Updates `mops.toml` and `mops.lock` (even when `CI` is set).

### `mops check`

Primary correctness command — runs moc check, then check-stable (if configured), then lint (if lintoko is in toolchain).

```bash
mops check                # all canisters
mops check backend        # single canister
mops check --fix          # autofix + check + stable + lint
mops check --verbose      # show moc invocations
mops check -- -Werror     # treat warnings as errors
```

**Always use canister names, not file paths.** Per-canister args from `mops.toml` are applied automatically.

`--fix` applies machine-applicable fixes from both moc and lintoko in one pass. Concurrent `--fix` runs (across processes) serialize automatically via an advisory lock at `.mops/fix.lock` — safe to invoke from multiple agents on the same project. Read-only files (e.g. frozen migrations) are skipped with a warning, not fixed.

### `mops build`

```bash
mops build                # all canisters
mops build backend        # single canister
mops build --verbose      # show compiler commands
mops build -- --ai-errors # pass extra moc flags
```

Produces `.wasm`, `.did`, and `.most` files in `[build].outputDir` (default `.mops/.build`).

With `[optimize]` in `mops.toml`, runs `wasm-opt` after candid metadata (default `-O3 -g`). Pin Binaryen with `mops toolchain use wasm-opt 131` (or let auto-pin write latest on first build). Soft-fails to unoptimized Wasm on error. Pass `--no-optimize` (on `build` or `bench`) to skip the pass for a single run without editing `mops.toml`.

### `mops deployed`

Post-deploy hook — keeps the on-disk `.most` baseline used by `check-stable` in sync with what's actually deployed.

```bash
mops deployed init backend   # one-time bootstrap: empty-actor baseline + sets [check-stable].path
mops deployed backend        # post-deploy: promotes .mops/.build/backend.most → deployed/backend.most
mops deployed                # all canisters
```

Default destination is `deployed/<name>.most`; override with `[deployed].dir` in `mops.toml` or `--dir`. It reads built `.most` files from `[build].outputDir` (default `.mops/.build`); override with `--build-dir`. `mops deployed` errors if the source `.most` is missing — it never regenerates. Run it from your deploy pipeline immediately after a successful deploy.

### `mops generate candid`

```bash
mops generate candid                # all canisters
mops generate candid backend        # single canister
mops generate candid backend -o <path>   # single canister, ad-hoc path
```

(Re)generates the curated `.did` from current Motoko source. With `[canisters.<name>].candid` set, overwrites that file. Without it, writes `<name>.did` next to `main` (e.g. `main = "src/Backend.mo"` → `src/backend.did`) and sets `[canisters.<name>].candid` in `mops.toml`. Run after every interface change; commit `.did` + `mops.toml` together. Same moc invocation as `mops build`, so the result always passes `mops build`'s subtype check.

### `mops toolchain`

```bash
mops toolchain use moc 1.7.0         # pin specific version
mops toolchain use moc latest        # pin latest version (non-interactive)
mops toolchain use lintoko 0.10.0    # pin specific version
mops toolchain use pocket-ic 12.0.0  # pin for replica tests / benchmarks (pin a specific version; `latest` may resolve to one the vendored `@dfinity/pic` client doesn't support)
mops toolchain use wasm-opt 131      # Binaryen for [optimize] (or `latest`)
mops toolchain update moc            # update to latest (requires existing [toolchain] entry)
mops toolchain update                # update all tools to latest
mops toolchain info <tool>           # show release info (latest, pinned, history)
mops toolchain info <tool> --versions # list recent stable releases, newest first
mops toolchain info <tool> --versions --all # full stable history (cache warming)
mops toolchain bin moc               # print path to binary
```

**`pocket-ic` versions**: `9.0.0` and newer run on the vendored `@dfinity/pic` client. Pins below `9.0.0` still work on the legacy `pic-ic` client but print a deprecation warning and are removed in mops v3 — pin `9.0.0` or newer.

**Agent note**: `toolchain use <tool>` without a version opens an interactive picker — do not use in scripts or agents. Always pass a version or `latest`. `toolchain update` only works when the tool already has a `[toolchain]` entry. `toolchain info <tool> --versions` works without `mops.toml` (first GitHub page by default; pass `--all` for full history).

### Enhanced migrations

When `[canisters.<name>.migrations]` is configured, `mops check`, `mops build`, and `mops check-stable` automatically inject `--enhanced-migration`. Do not add `--enhanced-migration` to `[canisters.<name>].args` — mops will error.

Create migration files directly in the `chain` directory.

After `mops check --fix` (or `mops check <canister>`) confirms the chain compiles, run `mops build` to produce the wasm artifact.

`check-limit` (optional) caps how many recent chain files `mops check` and `mops lint` consider — useful when the chain grows long and re-checking every old migration slows feedback down. `mops build` is unaffected by `check-limit`. When the limit kicks in, mops stages the included files into `.migrations-<canister>/` next to the `chain` directory (auto-`.gitignore`d). `moc` diagnostics may then print paths there — the real file lives in the `chain` directory with the same name.

Override `check-limit` for a single run with `--no-check-limit` (`mops check`, `mops check-stable`, `mops lint`) — e.g. `mops check --fix --no-check-limit` to autofix older, normally-trimmed migrations. On `mops check` and `mops check-stable`, `--no-check-limit` also suppresses the pending-migration warning.

When `check-limit` is set, `mops check-stable` (and the stable check inside `mops check`) reports if more migrations are pending than the limit allows — as an error if compat failed (replacing the misleading `moc` message), otherwise a warning.

### `mops remove <package>`

```bash
mops remove base
```

### Dependency Management

```bash
mops outdated             # list outdated dependencies (caret-bound)
mops update               # update all within caret bound (no major-version crossing)
mops update core          # update specific package within caret bound
mops update --major       # allow updates that cross major versions
mops update --patch       # restrict to patch bumps only (mutually exclusive with --major)
mops sync                 # add missing / remove unused packages
```

## Other Commands

### `mops publish`

```bash
mops publish              # publish to the registry (runs tests/docs/bench by default)
mops publish --dry-run    # same local steps as publish; no registry contact / identity
mops publish --dry-run --no-test --no-docs --no-bench   # packaging checks only
mops publish --no-test --no-docs --no-bench
```

`--dry-run` runs the same local publish pipeline (packaging checks, docs, changelog, tests, benchmarks) and prints the final file list, then stops before identity/upload. `--no-*` flags work as usual. It does **not** run canister config validation (SPDX/semver/name rules) or prove registry acceptance (already published, permissions, missing deps).

### `mops test`

Tests live in `test/*.test.mo`:

```bash
mops test                         # run all tests
mops test my-test                 # filter by name
mops test --mode wasi             # use wasmtime (for to_candid/from_candid)
mops test --reporter verbose      # show Debug.print output
mops test --watch                 # re-run on file changes
mops test -- -Werror              # pass extra moc flags
```

Replica tests (actor files or `// @testmode replica`) use `pocket-ic` from `[toolchain]`. With no pin they fall back to the deprecated `dfx` replica (warning printed) — pin `pocket-ic` in `[toolchain]` to silence it. Same applies to `mops bench` and `mops watch`.

### `mops bench`

Benchmarks live in `bench/*.bench.mo`:

```bash
mops bench                        # run all benchmarks
mops bench my-bench               # filter by name
mops bench --gc incremental       # select GC
mops bench --save                 # save results to .bench/<name>.json
mops bench --compare              # compare with saved results
mops bench -- -Werror             # pass extra moc flags
```

### `mops lint`

Runs lintoko (also runs automatically as part of `mops check` when lintoko is in toolchain):

```bash
mops lint                 # lint all .mo files
mops lint --fix           # autofix lint issues
mops lint <name>          # filter to .mo files matching <name>
```

When `[canisters.<name>.migrations].check-limit` is set, `mops lint` skips the trimmed chain migrations to match what `moc` sees during `mops check`. To lint a trimmed migration on demand, pass an explicit filter (e.g. `mops lint OldMigrationName`) or `--no-check-limit` to lint the full chain.

### `mops format`

```bash
mops format               # format all .mo files
mops format --check       # check formatting without modifying
```

## Common Patterns

### Warning suppression for a canister

Use per-canister `args` (not global) for suppressions:

```toml
[canisters.backend]
main = "src/backend/main.mo"
args = ["-A=M0198"]
```

### New project

```bash
mops init -y
mops toolchain use moc latest        # pin latest moc (non-interactive)
mops toolchain use lintoko latest    # pin latest lintoko
mops add core
```

Then configure `[moc].args`, `[canisters]`, and `[build]` in `mops.toml`.

To update tools later: `mops toolchain update moc` or `mops toolchain update` (all tools).
