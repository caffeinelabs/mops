# Caffeine: Migrating from raw moc to mops commands

How to simplify Caffeine's `mops`/`moc` usage by leveraging `mops.toml` configuration and new mops commands. Covers every pattern from `CAFFEINE_MOPS_MOC_USAGE.md`.

---

## Step 1: Configure `mops.toml`

All compiler flags and entry points move into `mops.toml` so they never need to be repeated on the CLI.

```toml
[canisters.backend]
main = "src/backend/main.mo"

[canisters.backend.check-stable]
path = ".old/src/backend/main.most"
skipIfMissing = true

[moc]
args = [
  "--default-persistent-actors",
  "--actor-idl=src/backend/system-idl",
  "--implicit-package=core",
  "-no-check-ir",
  "-E=M0236,M0235,M0223,M0237",
  "-A=M0198",
]
```

- `[canisters.backend].main` defines the entry point so commands no longer need explicit file paths.
- `[canisters.backend.check-stable]` enables automatic stable compatibility checking during `mops check`. `skipIfMissing = true` allows the file to not exist yet (e.g. first deployment).
- `[moc].args` is applied automatically to `mops check`, `mops build`, `mops test`, `mops bench`, and `mops watch`.
- The `=` syntax (`--flag=value`) and comma-grouped codes (`-E=M0236,M0235`) require moc 1.3.0+ (which mops already targets for `--all-libs` diagnostics).

---

## Step 2: Replace commands

### `mops check` — type-check

**Before** (10+ flags, explicit path):

```bash
mops check src/backend/main.mo -- \
  --actor-idl src/backend/system-idl \
  --default-persistent-actors \
  --implicit-package core \
  -no-check-ir \
  -E M0236 -E M0235 -E M0223 -E M0237 \
  -A M0198
```

**After:**

```bash
mops check
```

Entry point comes from `[canisters.backend].main`. Flags come from `[moc].args`.

### `mops check --fix` — auto-fix then re-check

**Before** (20+ line command):

```bash
mops check --fix src/backend/main.mo -- \
  --actor-idl src/backend/system-idl \
  --default-persistent-actors \
  --implicit-package core \
  -no-check-ir \
  -E M0236 -E M0235 -E M0223 -E M0237 \
  -A M0198 \
; mops check src/backend/main.mo -- \
  --actor-idl src/backend/system-idl \
  --default-persistent-actors \
  --implicit-package core \
  -no-check-ir \
  -E M0236 -E M0235 -E M0223 -E M0237 \
  -A M0198
```

**After:**

```bash
mops check --fix; mops check
```

### `mops build` — compile to WASM + generate Candid `.did`

**Before** (`moc --idl` and `moc -o`):

```bash
MOC="$(mops toolchain bin moc)"
SOURCES="$(mops sources --no-install)"
FLAGS="--actor-idl src/backend/system-idl --default-persistent-actors --implicit-package core -no-check-ir"

# Generate .did
$MOC $SOURCES $FLAGS --idl src/backend/main.mo
mv main.did backend.did

# Compile to WASM
$MOC $SOURCES $FLAGS -o backend.wasm src/backend/main.mo
```

**After:**

```bash
mops build
```

`mops build` already:
- Compiles to WASM (output: `.mops/.build/backend.wasm`)
- Generates `.did` (output: `.mops/.build/backend.did`)
- Reads entry point from `[canisters.backend].main`
- Applies `[moc].args` + `[build].args` + per-canister args

To customize the output directory:

```bash
mops build --output ./dist
```

### `mops check-stable` — upgrade compatibility check

**Before** (10-line workflow with temp files):

```bash
MOC="$(mops toolchain bin moc)"
SOURCES="$(mops sources --no-install)"
FLAGS="--actor-idl src/backend/system-idl --default-persistent-actors --implicit-package core -no-check-ir"

mkdir -p /tmp/upgrade
$MOC $SOURCES $FLAGS --stable-types .old/src/backend/main.mo
mv main.most /tmp/upgrade/old.most

$MOC $SOURCES $FLAGS --stable-types src/backend/main.mo
mv main.most /tmp/upgrade/new.most

$MOC --stable-compatible /tmp/upgrade/old.most /tmp/upgrade/new.most
```

**After:**

```bash
mops check-stable .old/src/backend/main.mo
```

`mops check-stable` handles everything:
1. Generates `.most` for the old version (from the `.mo` file)
2. Generates `.most` for the new version (from `[canisters.backend].main`)
3. Runs `--stable-compatible` to compare them
4. Cleans up temp files

If you already have a `.most` file instead of a `.mo` source file:

```bash
mops check-stable /path/to/old.most
```

For multi-canister projects, specify which canister:

```bash
mops check-stable .old/src/backend/main.mo backend
```

### `moc --print-deps` — stays as explicit `moc` invocation

This is only used by the `motoko_dependencies.ts` DFS tool, not by AI agents directly. No change needed:

```bash
MOC="$(mops toolchain bin moc)"
SOURCES="$(mops sources --no-install)"
$MOC $SOURCES --print-deps src/backend/main.mo
```

### `mops toolchain bin moc` and `mops sources --no-install` — still available

These remain available for any custom tooling that needs direct `moc` access (like `--print-deps` above). But AI agents should no longer need them for standard workflows.

---

## Summary: before and after

| Workflow | Before | After |
|---|---|---|
| Type-check | `mops check src/backend/main.mo -- <10 flags>` | `mops check` |
| Auto-fix + re-check | `mops check --fix src/backend/main.mo -- <10 flags>; mops check src/backend/main.mo -- <10 flags>` | `mops check --fix; mops check` |
| Generate `.did` | `$MOC $SOURCES $FLAGS --idl main.mo; mv main.did backend.did` | `mops build` |
| Compile to WASM | `$MOC $SOURCES $FLAGS -o backend.wasm main.mo` | `mops build` |
| Upgrade safety check | 10-line shell script with temp files | `mops check-stable .old/src/backend/main.mo` (or automatic via `[check-stable]` config) |
| Dependency detection | `$MOC $SOURCES --print-deps main.mo` | No change (custom tool only) |

---

## What can be deleted on the Caffeine side

1. **Flag duplication** in SKILL.md, `createMocCommand()`, and all bash snippets — flags now live in `mops.toml`
2. **`mopsMocShell()` shim** and its 6 call sites — no longer needed for check, build, or upgrade workflows
3. **Manual binary/source resolution** (`mops toolchain bin moc` + `mops sources --no-install`) for standard workflows
4. **The "Direct Moc Access" section** in SKILL.md — only `--print-deps` still needs it
5. **Temp file management** in the upgrade check workflow — handled by `mops check-stable`

---

## Automatic stable checks with `mops check`

By adding a `[canisters.backend.check-stable]` section to `mops.toml`, `mops check` will automatically run the stable compatibility check after type-checking — no separate `mops check-stable` invocation needed.

```toml
[canisters.backend]
main = "src/backend/main.mo"

[canisters.backend.check-stable]
path = ".old/src/backend/main.most"
skipIfMissing = true
```

- `path` — the deployed version's `.most` file (preferred) or `.mo` source file. When a `.mo` file is provided, stable types are generated from it (the file must compile).
- `skipIfMissing = true` — instead of erroring when the file doesn't exist (e.g. initial deployment with no previous version), emit a warning and skip the stable check.

With this configuration, the entire pre-deployment workflow reduces to:

```bash
mops check
```

This will type-check `src/backend/main.mo` and then verify stable variable compatibility against `.old/src/backend/main.most`.
