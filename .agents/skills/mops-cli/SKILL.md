---
name: mops-cli
description: Manage Motoko projects with the mops CLI — toolchain pinning, dependency management, type-checking, building, and linting. Use when working with mops.toml, mops.lock, running mops commands, adding/removing packages, pinning moc or lintoko versions, checking or building canisters, configuring moc flags, or setting up a new Motoko project.
---

# Mops CLI

Opinionated guide for Motoko projects. Covers project config, dependency management, type-checking, building, and linting.

## Key Principles

1. **No dfx** — always pin `moc` in `[toolchain]`. Use the newest `moc` version.
2. **No `mo:base`** — it is deprecated. Always use `mo:core` (`import Array "mo:core/Array"`).
3. **All config in `mops.toml`** — canisters, moc flags, toolchain versions, build settings.
4. **Canister-centric workflow** — define all canisters in `[canisters]`; never pass file paths to `mops check`. Exception: library packages (no `[canisters]`) use file paths directly: `mops check src/**/*.mo`.

## Project Setup

### Minimal `mops.toml`

```toml
[toolchain]
moc = "1.5.1"
lintoko = "0.9.0"

[dependencies]
core = "2.2.0"

[moc]
args = ["--default-persistent-actors", "-W=M0223,M0236,M0237"]

[canisters.backend]
main = "src/backend/main.mo"

[canisters.backend.migrations]
chain = "src/backend/migrations"
next = "src/backend/next-migration"   # optional — needed for `mops migrate new/freeze`
check-limit = 1
build-limit = 100

[canisters.backend.check-stable]
path = ".old/src/backend/dist/backend.most"

[build]
outputDir = "src/backend/dist"
args = ["--release"]
```

`check-stable` verifies stable variable compatibility against a `.most` file from the deployed version. For a new project with no prior deployment, create a trivial `.most` file representing an empty actor:

```most
// Version: 1.0.0
actor {
  
};
```

Optional canister fields: `candid` (path to .did for compatibility checking), `initArg` (Candid-encoded init args).

### Warning Flags

`-W=M0223,M0236,M0237` — redundant type instantiation (M0223), suggest contextual dot notation (M0236), suggest redundant explicit arguments (M0237). These are allowed (disabled) by default; `-W=` enables them as warnings.

### Moc Args Layering

Flags are applied in this order (later overrides earlier):

1. `[moc].args` — global, all commands (check, build, test, etc.)
2. `[build].args` — build only (e.g. `--release`)
3. `[canisters.<name>.migrations]` — auto-injected `--enhanced-migration` (managed by mops)
4. `[canisters.<name>].args` — per-canister
5. CLI `-- <flags>` — one-off overrides

## Core Commands

### `mops install`

```bash
mops install
```

Run after cloning or after manual `mops.toml` edits. Updates `mops.lock`. In CI, uses `--lock check` by default (fails if lockfile is stale).

### `mops add <package>`

```bash
mops add core             # latest version
mops add core@2.2.0       # specific version
mops add --dev test       # dev dependency
```

Updates `mops.toml` and `mops.lock`.

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

`--fix` applies machine-applicable fixes from both moc and lintoko in one pass.

### `mops build`

```bash
mops build                # all canisters
mops build backend        # single canister
mops build --verbose      # show compiler commands
mops build -- --ai-errors # pass extra moc flags
```

Produces `.wasm`, `.did`, and `.most` files in `[build].outputDir` (default `.mops/.build`).

### `mops toolchain`

```bash
mops toolchain use moc 1.5.1         # pin specific version
mops toolchain use moc latest        # pin latest version (non-interactive)
mops toolchain use lintoko 0.9.0     # pin specific version
mops toolchain update moc            # update to latest (requires existing [toolchain] entry)
mops toolchain update                # update all tools to latest
mops toolchain bin moc               # print path to binary
```

**Agent note**: `toolchain use <tool>` without a version opens an interactive picker — do not use in scripts or agents. Always pass a version or `latest`. `toolchain update` only works when the tool already has a `[toolchain]` entry.

### `mops migrate`

Manage enhanced migration chains:

```bash
mops migrate new AddEmail         # create a new migration file in next-migration/
mops migrate new AddEmail backend # specify canister explicitly
mops migrate freeze               # move next-migration to the permanent chain
mops migrate freeze backend       # specify canister explicitly
```

When `[canisters.<name>.migrations]` is configured, `mops check`, `mops build`, and `mops check-stable` automatically inject `--enhanced-migration`. Do not add `--enhanced-migration` to `[canisters.<name>].args` when using managed migrations — mops will error.

Typical workflow: make a breaking change → `mops check` fails with a hint → `mops migrate new Name` → edit migration → `mops check` passes → `mops build` → deploy → `mops migrate freeze`.

### `mops remove <package>`

```bash
mops remove base
```

### Dependency Management

```bash
mops outdated             # list outdated dependencies
mops update               # update all to latest compatible
mops update core          # update specific package
mops sync                 # add missing / remove unused packages
```

## Other Commands

### `mops test`

Tests live in `test/*.test.mo`:

```bash
mops test                         # run all tests
mops test my-test                 # filter by name
mops test --mode wasi             # use wasmtime (for to_candid/from_candid)
mops test --reporter verbose      # show Debug.print output
mops test --watch                 # re-run on file changes
```

### `mops lint`

Runs lintoko (also runs automatically as part of `mops check` when lintoko is in toolchain):

```bash
mops lint                 # lint all .mo files
mops lint --fix           # autofix lint issues
```

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
mops init -y                         # pins latest moc (when no dfx.json) + adds latest core
mops toolchain use lintoko latest    # pin latest lintoko
mops toolchain use moc latest        # no-op after init -y without dfx.json; forces latest moc otherwise
mops add core                        # no-op if already a dep; adds it when init picked base instead
```

Then configure `[moc].args`, `[canisters]`, and `[build]` in `mops.toml`.

To update tools later: `mops toolchain update moc` or `mops toolchain update` (all tools).
