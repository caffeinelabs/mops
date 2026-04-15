# Managed Migrations

**Status**: Draft specification

## Problem

Users of `--enhanced-migration` must manually:
1. Name migration files with timestamp prefixes and place them in the correct directory
2. Keep `.most` files around for stability checks
3. Pass `--enhanced-migration=<path>` in canister args

Mops should manage the migration lifecycle so users can focus on writing migration logic.

## Overview

Mops introduces a `[canisters.<name>.migrations]` config section that manages enhanced migrations as a first-class concept. The key ideas:

- A **chain directory** holds the frozen (committed) migration files
- A **next-migration directory** holds 0 or 1 migration file currently being developed
- Mops merges both directories during `check` / `build` and auto-adds the `--enhanced-migration` flag to `moc`
- A `mops migrate freeze` command moves the next migration into the chain
- Configurable **chain trimming** limits the number of migrations compiled into the wasm

## Config

```toml
[canisters.backend]
main = "src/main.mo"

[canisters.backend.migrations]
chain = "migrations"          # path to frozen migration chain directory
next = "next-migration"       # path to next-migration directory (0 or 1 files)
check-limit = 1               # max migrations in chain suffix for mops check (optional)
build-limit = 100             # max migrations in chain suffix for mops build (optional)
```

All paths are relative to `mops.toml`.

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `chain` | yes | Path to the directory containing frozen migration `.mo` files. Mops auto-adds `--enhanced-migration=<resolved-path>` to `moc` args. Users must NOT also put `--enhanced-migration` in `[canisters.<name>].args`. |
| `next` | yes | Path to the directory holding the next migration being developed. Must contain 0 or 1 `.mo` files. Required for `mops migrate` commands. |
| `check-limit` | no | Maximum number of migration files (from the end of the chain) to include when running `mops check`. When omitted, the full chain is used. |
| `build-limit` | no | Maximum number of migration files (from the end of the chain) to include when running `mops build`. When omitted, the full chain is used. |

### Why separate limits

- `check-limit = 1` gives fast iteration during development — only the latest migration is type-checked against the actor.
- `build-limit` controls the wasm size. Large migration chains produce large wasms that may exceed Internet Computer deployment limits (~2 MB). A `build-limit` of 100 means the wasm can handle up to 100 pending migrations during a single upgrade.

## Directory Layout

```
backend/
├── main.mo
├── migrations/                          # chain: frozen migrations (committed to git)
│   ├── 20250101_000000_Init.mo
│   └── 20250201_000000_AddField.mo
└── next-migration/                      # next: 0 or 1 file (committed to git)
    └── 20260415_120000_AddEmail.mo       # user picks the final name upfront
```

The file in `next-migration/` already has its permanent name. When frozen, it moves to `migrations/` unchanged. No renaming occurs.

## Commands

### `mops migrate new <Name> [canister]`

Creates a new migration file in the `next` directory.

- Generates a timestamp prefix: `YYYYMMDD_HHMMSS`
- Creates `<next>/<timestamp>_<Name>.mo` with a migration module template
- If `[canister]` is omitted, auto-selects when exactly one canister has `[migrations]` configured; errors if multiple

**Template content:**
```motoko
module {
  public func migration(old : {}) : {} {
    {}
  }
}
```

**Errors:**
- `[migrations]` not configured in `mops.toml`
- `next` directory already contains a `.mo` file
- `chain` directory already contains a file that sorts after the generated name (should not happen with timestamps, but validated as a safety check)

### `mops migrate freeze [canister]`

Moves the next migration file into the frozen chain directory.

- Moves the single `.mo` file from `next` to `chain`
- If `[canister]` is omitted, auto-selects when exactly one canister has `[migrations]` configured

**Errors:**
- `[migrations]` not configured in `mops.toml`
- `next` directory is empty (no file to freeze)

### Modified: `mops check` / `mops build`

When `[canisters.<name>.migrations]` is configured:

1. List `.mo` files in `chain` directory (sorted lexicographically)
2. If a `check-limit` or `build-limit` is set, take only the last N files (suffix of chain)
3. If `next` directory has a file, include it (so the temp dir has at most limit + 1 files)
4. Create a temp directory (inside `.mops/`) with symlinks or copies of these files
5. Auto-add `--enhanced-migration=<temp-dir>` to `moc` args
6. If trimming is active, suppress M0254 warnings (see [Chain Trimming](#chain-trimming))
7. Run `moc`
8. Clean up the temp directory

When `next` is empty and no trimming is needed, pass `--enhanced-migration=<chain-path>` directly (no temp dir).

## Chain Trimming

### Mechanism

Trimming removes a prefix of the migration chain so that `moc` only processes the last N migrations. This is done by creating a temp directory with only the relevant files.

Example with `check-limit = 1` and a chain of `[Init, AddField, RenameField]` + next migration `AddEmail`:
- Temp dir contains: `RenameField.mo`, `AddEmail.mo` (1 from chain + 1 next)
- `Init.mo` and `AddField.mo` are excluded

### M0254 Warning Suppression

When the chain is trimmed, the first migration in the temp dir has a non-empty input type. The `moc` compiler emits M0254 warnings ("initial actor requires field X") for each field in that input. These warnings are expected and harmless — mops suppresses them automatically when trimming is active.

### Runtime Safety

The deployed canister's RTS tracks which migrations have been applied via `rts_was_migration_performed`. During an upgrade:
- Already-applied migrations are skipped
- Only new (unapplied) migrations execute

A wasm built with `build-limit = 100` containing migrations 50–150 will correctly skip migrations 50–149 (already applied) and only execute migration 150.

### Limits and the Next Migration

The limit applies to **chain** files only. The next migration is always appended on top of the limited suffix, so the effective count in the temp dir is `min(chain_length, limit) + (1 if next exists)`.

## Validation Rules

| Rule | When checked |
|------|-------------|
| `next` dir must contain 0 or 1 `.mo` files | `check`, `build`, `migrate new`, `migrate freeze` |
| Next-migration filename must sort lexicographically after all files in `chain` dir | `check`, `build`, `migrate freeze` |
| `chain` path must exist (or be creatable) | `migrate new` (creates if missing) |
| `next` path must exist (or be creatable) | `migrate new` (creates if missing) |
| `[migrations]` config must be present | `migrate new`, `migrate freeze` (error if missing) |
| `check-limit` and `build-limit` must be > 0 | config validation |

### Ordering Validation

The next-migration filename must sort after every file in the chain directory using standard string comparison. No specific naming format is enforced — timestamps (`YYYYMMDD_HHMMSS_Name.mo`) are a convention that produces good lexicographic ordering, but any scheme that sorts correctly is valid.

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| No `[migrations]` config on canister | Feature disabled. Everything works as before. Users can still use `--enhanced-migration` in `args` manually. |
| `[migrations]` configured, `next` dir empty | No pending migration. Use `chain` dir directly (with trimming if limits set, no temp dir needed otherwise). |
| `chain` dir empty + file in `next` | Valid. The next migration is the init migration (its input should be `{}`). |
| Neither `chain` nor `next` dir exists | `mops migrate new` creates both directories. `mops check` / `mops build` error if `chain` doesn't exist. |
| Limit larger than chain length | Use full chain, no trimming. |
| Limit = 0 | Invalid config, error at validation time. |
| `mops migrate new` when `next` has a file | Error: "A next migration already exists. Freeze it first with `mops migrate freeze`." |
| `mops migrate freeze` when `next` is empty | Error: "No next migration to freeze. Create one with `mops migrate new <Name>`." |
| Stable check fails and `[migrations]` is configured | Emit hint: "You may need a migration. Run `mops migrate new <Name>` to create one." |

## Interaction with Existing Features

### `check-stable`

The `[canisters.<name>.check-stable]` config continues to work independently. When both `[migrations]` and `[check-stable]` are configured:
1. `mops check` compiles with the merged migration chain (including next migration)
2. Then runs the stable compatibility check using the configured `check-stable.path`
3. If the stable check fails and `[migrations]` is configured, an extra hint is emitted

### Canister `args`

When `[migrations]` is configured, mops auto-adds `--enhanced-migration=<path>` to `moc` invocations. Users must NOT also include `--enhanced-migration` in `[canisters.<name>].args` — mops should detect this and emit an error to prevent duplicate/conflicting flags.

## Scope

### In scope (this feature)
- Next-migration lifecycle: `mops migrate new`, `mops migrate freeze`
- Chain trimming with configurable limits per command
- Auto `--enhanced-migration` flag management
- M0254 suppression during trimming
- Migration hint on stable check failure
- Validation of next-migration ordering and directory contents

### Out of scope (future work)
- `.most` file management (auto-save deployed state, track deployments)
- Deployed state tracking (knowing what's actually on the canister)
- Auto-detecting whether a migration is needed (analyzing field changes)
- `mops migrate status` command (showing chain state, pending migrations)
