# Spec: `mops deployed`

Status: Draft / proposal

## Problem

`mops build` emits three artifacts from a single `moc` invocation into the output
dir (`.mops/.build` by default): `<name>.wasm`, `<name>.did`, `<name>.most`. They
are internally consistent by construction.

The `.wasm` is what gets deployed. The other two need to be **committed to the repo
as the deployed snapshot**, for two different consumers:

- **`.most` (stable signature)** — input to the next upgrade's stable-compatibility
  check: `mops check-stable` runs `moc --stable-compatible <deployed.most> <new.most>`.
  It must match the code currently running on-chain or the check is meaningless
  (false passes → silent data loss on upgrade; false failures → blocked upgrades).
- **`.did` (Candid interface)** — a committed record of the deployed interface, used
  by external tooling: `@icp-sdk/bindgen` generates TypeScript clients from it,
  `icp canister call` encodes arguments with it, and the repo reflects what's
  deployed. **mops itself does not consume it** — it is a pure output artifact the
  icp-cli integration asked mops to place.

Today the snapshot is maintained by hand: deploy, then remember to copy the new
`.most`/`.did` into committed paths. Forget, and they drift from on-chain reality.

`mops deployed` makes producing this snapshot a first-class, scriptable step the
[icp-cli Motoko recipe](https://github.com/dfinity/icp-cli-recipes) can call in its
post-install `sync` phase.

## Goals

- Promote the **already-built** `.most` and `.did` into a committed snapshot
  directory, reusing the exact artifacts that produced the deployed wasm.
- Bootstrap the stable check — file **and** `mops.toml` entry — before the first
  deployment, so users don't configure paths by hand.
- Be DRY: callers pass only a canister name (mirrors `mops build <name>`).
- Follow existing canister-selection conventions (`mops build` / `mops check`).

## Non-goals

- **No regeneration / compilation.** The command never runs `moc`; it strictly
  copies the artifacts left by `mops build`. If they're missing, it errors. This is
  what keeps the snapshot atomically tied to the deployed wasm.
- **No reading from chain or wasm metadata.** Files are managed locally and committed.
- **No Candid compatibility check.** mops does not consume the snapshot `.did`; a
  rolling deployed-interface check (`check-candid`) is out of scope (see Open
  Questions).
- **The existing `[canisters.<name>].candid` field is ignored** — not read, not
  written. It is an optional *curated interface to embed in the wasm* (a different,
  opposite-in-time concept); see Appendix.
- **No network/environment dimension** (see Open Questions).

## The deployed directory

`mops deployed` owns a single, configurable output directory. It is the **only**
thing that determines where the snapshot is written — independent of any other path.

```toml
[deployed]
dir = "deployed"   # optional; default "deployed" (relative to mops.toml)
```

For a canister `<name>`, `update` always writes:

- `<dir>/<name>.most`
- `<dir>/<name>.did`

The directory is overridable per invocation with `--dir <path>`. All canisters share
the one directory, namespaced by canister name.

### Relationship to `check-stable` (synergy, not coupling)

`mops deployed` does not read `[check-stable].path`. They are wired together by
`init`, which sets `[check-stable].path` to `<dir>/<name>.most` so that the file
`update` writes is exactly the file `check-stable` reads:

```toml
[canisters.backend.check-stable]
path = "deployed/backend.most"   # set by `mops deployed init` to match the snapshot
```

A user may point `[check-stable].path` elsewhere. That's allowed, but then
`check-stable` won't see what `update` writes, so `update` and `init` **warn**:

```
WARN: [canisters.backend.check-stable].path is "old/backend.most" but
      `mops deployed` writes "deployed/backend.most". check-stable will not
      see the snapshot. Set them to the same path (see `mops deployed init`).
```

## Why "deployed update", not "deployed sync"

`update`, for these reasons:

- `mops sync` already exists and means "reconcile `mops.toml` deps with code
  imports". Reusing `sync` for a different target is confusing.
- `icp` already calls its post-install phase `sync`; `mops deployed sync` inside an
  `icp sync` step reads badly.
- The action is "advance the saved snapshot forward to the just-deployed version" —
  an update/bump, matching `mops update` and `mops toolchain update`.

## Command surface

```
mops deployed update [canisters...]   # promote built .most + .did → <dir>
mops deployed init   [canisters...]   # write .most baseline + point check-stable at it
mops deployed status [canisters...]   # (extension) report drift, no writes
```

`deployed` is a subcommand group, like `mops toolchain`.

### `mops deployed update [canisters...]`

The main use case. For each selected canister `<name>`:

- copy `<outputDir>/<name>.most` → `<dir>/<name>.most`,
- copy `<outputDir>/<name>.did`  → `<dir>/<name>.did`.

Details:

- **Source dir** (`<outputDir>`): `[build].outputDir ?? .mops/.build`, overridable
  with `--output <dir>` (mirrors `mops build --output`, so the recipe passes the same
  value it built with).
- **Destination dir** (`<dir>`): `[deployed].dir ?? deployed`, overridable with
  `--dir <path>`.
- **Copy-or-error**: if a source artifact is missing, error
  (`No built <ext> at <path>. Run \`mops build <name>\` first.`). Never regenerate.
- **Create the destination dir** (`mkdir -p`).
- Always overwrites — advancing the snapshot is the point.
- **Warns** when `[check-stable].path` is set but differs from `<dir>/<name>.most`
  (see above).

Flags:

- `--output <dir>` — source directory (build output).
- `--dir <path>` — destination directory (snapshot).
- `--no-did` — write only the `.most` (for projects that don't want the interface
  committed). Default writes both.
- `--check` — CI gate. No writes; exit non-zero if a destination differs from the
  built artifact (or is missing). Enforce "the committed snapshot matches the latest
  build" with `mops build && mops deployed update --check`.

### `mops deployed init [canisters...]`

Prepare a canister for stable checking so the first `mops check` has a baseline —
without hand-editing `mops.toml`. For each selected canister:

1. If the baseline file `<dir>/<name>.most` does not exist, create it with an
   empty-actor signature:
   ```most
   // Version: 1.0.0
   actor { };
   ```
2. Point `check-stable` at it:
   - if `[canisters.<name>.check-stable].path` is **unset** → set it to
     `<dir>/<name>.most`;
   - if it is **set to a different path** → leave it unchanged and **warn** that it
     won't coincide with `mops deployed update`.

No `.did` baseline is created — mops doesn't consume the `.did`, so it simply appears
after the first `mops deployed update` (and `icp build` generates one on demand for
bindings before then). Idempotent; `--force` recreates the baseline file.

> **Caveat — TOML rewrite.** mops writes config via `writeConfig` → `TOML.stringify`
> (`cli/mops.ts:229`), which reserializes the whole file and drops comments / custom
> formatting. This already happens for `mops add` / `mops remove`, so it's accepted
> behavior, but `init` must only write when it actually changes config.

### `mops deployed status [canisters...]` (extension)

Read-only drift report: per canister, whether the committed snapshot matches the
latest built artifacts (in sync / stale / missing / not built), and whether
`check-stable.path` coincides with the snapshot. Same info as `update --check` plus
the coincidence check, but human-readable and non-failing.

## Canister selection (single vs multiple)

Identical to `mops build` / `mops check`:

- **No argument** → all `[canisters]` entries. A single-canister project "just works"
  with a bare command — no special-casing.
- **One or more names** → only those; unknown names error (`filterCanisters`).

`update` does not require `[check-stable]` to be configured — it always writes the
snapshot to `<dir>`. The check-stable coincidence is a warning, not a gate.

The icp-cli integration always uses the **named** form. `icp` expands the recipe
**once per canister**, so the `sync` step runs per canister with its own name —
multi-canister projects are handled by `icp` iterating, not by the command fanning
out:

```yaml
# recipes/motoko/recipe.hbs (sync phase)
sync:
  steps:
    - type: script
      commands:
        - mops deployed update "{{ _.canister.name }}" --output .mops/.build
```

## Lifecycle

```
# once, before first deploy — writes empty .most baseline + points check-stable at it
mops deployed init backend

# every change
mops check backend                  # new vs committed .most baseline
mops build backend                  # produces .mops/.build/backend.{wasm,did,most}
icp deploy                          # installs the wasm, then sync runs:
  mops deployed update backend      #   snapshots .most + .did into deployed/
git add deployed/ && git commit     # commit the new deployed snapshot
```

## Edge cases

- **Migrations**: `mops build` already injects `--enhanced-migration` when
  `[canisters.<name>.migrations]` is set, so the emitted `.most` reflects it; the
  command copies as-is.
- **`--output` mismatch**: the recipe forces `--output .mops/.build`; `mops deployed
  update` must read the same dir. Both default to `[build].outputDir ?? .mops/.build`;
  the recipe passes `--output` explicitly to guarantee a match.
- **Standalone `update` with a stale/empty output dir**: errors (copy-or-error).
  Intentional — prevents promoting artifacts that don't correspond to a fresh build.

## Open questions

1. **Config surface for the directory.** Proposed global `[deployed].dir` (default
   `deployed`) plus `--dir`. A per-canister override could be added later if needed.
2. **Network/environment dimension.** `icp` environments can deploy different
   versions to `staging` vs `ic`, but the snapshot is single (effectively
   "latest / prod"). A future per-environment directory may be needed.
3. **`check-candid` (deferred).** A rolling deployed-interface compatibility check
   would need its own config field and a check wired into `mops check`, distinct from
   the embedded `candid`. Out of scope now.
4. **Deployed manifest (speculative).** Record wasm hash / `moc` version / timestamp
   per canister to make "what is deployed" auditable from the repo, without touching
   the chain.

## Appendix: why the snapshot `.did` is not the `candid` field

`mops build` already generates and embeds the Candid interface in the wasm by default
(`--public-metadata candid:service`), so the deployed canister self-describes without
any file. The optional `[canisters.<name>].candid` field *overrides* that: when set,
the build verifies the generated interface is a subtype of the file and **embeds the
file** (`cli/commands/build.ts:184-200`). It is a *curated, ahead-of-code* contract.

The snapshot `.did` is the opposite: a *generated, lags-code* record of what was just
deployed. Writing the snapshot into `candid` would make the next build embed the
previous version's interface into the new wasm. They are different artifacts in
opposite directions in time, which is why `mops deployed` ignores `candid` entirely
and writes the snapshot to its own directory.
