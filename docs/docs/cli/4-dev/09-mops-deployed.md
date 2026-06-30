---
slug: /cli/mops-deployed
sidebar_label: mops deployed
---

# `mops deployed`

Post-deploy hook: promote the just-built `.most` stable-types file into a committed `deployed/` directory so [`mops check-stable`](/cli/mops-check-stable) compares against the deployed version on the next build.

```
mops deployed [canisters...]      # promote .most → deployed/
mops deployed init [canisters...] # one-time bootstrap: empty-actor baseline + wire [check-stable].path
```

Run `mops deployed` after a successful deploy. It does **not** read from chain or wasm metadata — it only copies the local `.most` left by `mops build` into the project's `deployed/` directory so the on-disk stable-check baseline always matches the wasm you just deployed.

For canister selection rules, see [`mops build`](/cli/mops-build).

## Lifecycle

```bash
# once, before first deploy
mops deployed init backend     # writes empty .most baseline + sets [check-stable].path

# every change
mops check backend             # compares new code against committed .most baseline
mops build backend             # produces .mops/.build/backend.{wasm,did,most}
icp deploy                     # installs the wasm, then runs:
  mops deployed backend        #   post-deploy hook: promotes .most → deployed/
git add deployed/ && git commit
```

## `mops deployed [canisters...]`

For each selected canister, copy `<build-dir>/<name>.most` → `<dir>/<name>.most`.

- **Source** (`<build-dir>`): `[build].outputDir` from `mops.toml`, default `.mops/.build`. Override with `--build-dir`.
- **Destination** (`<dir>`): `[deployed].dir` from `mops.toml`, default `deployed`. Override with `--dir`.

A missing source `.most` is an error — never regenerates. Always overwrites the destination. The destination directory is created if missing.

Warns when `[canisters.<name>.check-stable].path` does not point at `<dir>/<name>.most` — the configured stable-check baseline won't see the update.

### Options

- `--build-dir <dir>` — directory to read built `.most` files from. Default: `[build].outputDir` or `.mops/.build`.
- `--dir <dir>` — destination directory. Default: `[deployed].dir` or `deployed`.

## `mops deployed init [canisters...]`

Pre-first-deploy bootstrap. For each selected canister:

1. If `<dir>/<name>.most` does not exist, create it with an empty-actor baseline:
   ```
   // Version: 1.0.0
   actor { };
   ```
2. If `[canisters.<name>.check-stable].path` is unset, set it to `<dir>/<name>.most` (and rewrite `mops.toml`). If it's already set elsewhere, leave it and warn.

Idempotent — re-running is a no-op when both checks already hold.

### Options

- `--dir <dir>` — destination directory. Default: `[deployed].dir` or `deployed`.

:::note
`mops deployed init` writes to `mops.toml` via the same machinery as `mops add` / `mops remove`: comments and custom formatting in the config are not preserved.
:::

## `[deployed]` config

```toml
[deployed]
dir = "deployed"   # optional; default "deployed"
```

All canisters share one directory. Path is relative to `mops.toml`.

## Why not handle `.did` here too?

`.did` is a curated build-input contract (subtype-checked and embedded into the wasm by `mops build`), not a deploy artifact — its lifecycle is interface-change-driven, not deploy-driven. `mops deployed` only handles `.most`.
