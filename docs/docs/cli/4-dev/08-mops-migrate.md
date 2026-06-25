---
slug: /cli/mops-migrate
sidebar_label: mops migrate
---

# `mops migrate`

:::warning Experimental
`mops migrate` is **experimental** and not recommended for general use yet — its commands and configuration may change. The recommended workflow is to create migration files directly in your `chain` directory; see [`[canisters.<name>.migrations]`](/mops.toml#canistersnamemigrations).
:::

Manage enhanced migration chains.

Migration files define how canister state transforms from one version to the next. They let you batch multiple incompatible stable state changes and deploy them together in a single upgrade. Each migration is a Motoko module with a `migration` function that takes the old state shape and returns the new one.

## `mops migrate new`

```
mops migrate new <Name> [canister]
```

Create a new migration file in the `next` directory configured by `[canisters.<name>.migrations].next`.

- **`<Name>`** — descriptive name for the migration (e.g. `AddEmail`, `RemoveCounter`)
- **`[canister]`** — canister name. Auto-detected if exactly one canister has `[migrations]` configured

The file is created with a timestamp prefix for correct ordering: `YYYYMMDD_HHMMSS_<Name>.mo`.

### Examples

```
mops migrate new AddEmail
mops migrate new RemoveCounter backend
```

## `mops migrate freeze`

```
mops migrate freeze [canister]
```

Move the migration file from the `next` directory into the `chain` directory, making it part of the permanent migration chain.

- **`[canister]`** — canister name. Auto-detected if exactly one canister has `[migrations]` configured

Call `freeze` after verifying the migration with `mops check` and `mops build`. Once frozen, the migration becomes part of the permanent chain.

### Example

```
mops migrate freeze
```

## Configuration

Migrations are configured per-canister in `mops.toml`:

```toml
[canisters.backend.migrations]
chain = "migrations"
next = "next-migration"
check-limit = 1
build-limit = 100
```

`chain` and `next` must live in the same parent directory. Migration files can import from sibling folders (e.g. a shared `types/` folder) using relative paths — mops stages the active chain into `<parent-of-chain>/.migrations-<canister>/` for compilation, preserving the depth of the originals so relative imports resolve identically. The staged dir self-stamps a `.gitignore`, and `mops init` adds `.migrations-*/` to the project `.gitignore`.

`moc` diagnostics may point to a staged path under `.migrations-<canister>/`, which mops removes when the command finishes.

See [`mops.toml` reference](/mops.toml#canistersnamemigrations) for all fields.

## Typical workflow

1. Make a breaking change to your canister's stable state
2. Run `mops check` — the stable compatibility check fails, with a hint to create a migration
3. Run `mops migrate new AddEmail` — creates a migration file in `next-migration/`
4. Edit the migration file to define the state transformation
5. Run `mops check` — verifies the migration makes the upgrade compatible
6. Run `mops build` — builds the WASM with the migration included
7. Deploy the canister
8. Run `mops migrate freeze` — moves the migration into the permanent chain

## Chain trimming

Large migration chains increase WASM size and compilation time. Use `check-limit` and `build-limit` to trim the chain:

- **`check-limit`** — only the last N migrations are included during `mops check`, `mops check-stable`, and `mops lint`. Set to `1` for fastest type-checking and linting. Pass an explicit filter (`mops lint <name>`) or file path to lint a trimmed migration on demand.
- **`build-limit`** (**experimental**) — only the last N migrations are included during `mops build`. Set higher (e.g. `100`) so the deployed WASM can apply multiple pending migrations.

To override `check-limit` for a single run, pass `--no-check-limit` to `mops check`, `mops check-stable`, or `mops lint`. This processes the full chain regardless of the configured limit — useful for `mops check --fix --no-check-limit` to autofix issues in older, normally-trimmed migrations.

The limits count the full virtual chain (frozen + pending next migration). This means `mops build` produces identical results whether a migration is still pending or already frozen.

Already-applied migrations are skipped at runtime by the Motoko RTS, so trimming is safe. When trimming is active, M0254 warnings are automatically suppressed.

When `check-limit` is set, `mops check-stable` (and the stable check inside `mops check`) compares the deployed `.most` baseline against the local chain after the compatibility check. If more migrations are pending than `check-limit` allows, a warning explains that `mops check` will likely fail even though deploy would succeed, and suggests folding all changes into the latest pending migration. The warning only runs when `check-limit` is configured and the baseline is a committed `.most` file (not a `.mo` source passed on the command line).
