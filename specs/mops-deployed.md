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

- Promote the **already-built** `.most` and `.did` into a committed `deployed/`
  snapshot, reusing the exact artifacts that produced the deployed wasm.
- Bootstrap the stable reference — file **and** `mops.toml` entry — before the first
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

## The `deployed/` snapshot

All committed snapshot files for a canister live together, anchored on the single
path mops already consumes — `[canisters.<name>.check-stable].path`:

- the `.most` is written to `[check-stable].path` (consumed by `check-stable`),
- the `.did` is written next to it, as `<name>.did` in the same directory.

`mops deployed init` defaults `[check-stable].path` to `deployed/<name>.most`, so by
default both files land in a `deployed/` directory at the project root, giving the
icp side a predictable path (`deployed/<name>.did`) to reference. Users who point
`[check-stable].path` elsewhere get both files in that directory instead. There is
exactly one anchor and no new config field.

```toml
[canisters.backend]
main = "src/backend/main.mo"

[canisters.backend.check-stable]
path = "deployed/backend.most"   # ← anchor: most lands here, did lands beside it
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
mops deployed update [canisters...]   # promote built .most + .did → deployed snapshot
mops deployed init   [canisters...]   # configure check-stable + write .most baseline
mops deployed status [canisters...]   # (extension) report drift, no writes
```

`deployed` is a subcommand group, like `mops toolchain`.

### `mops deployed update [canisters...]`

The main use case. For each selected canister `<name>`:

- copy `<outputDir>/<name>.most` → `[check-stable].path`,
- copy `<outputDir>/<name>.did`  → `<dir of check-stable.path>/<name>.did`.

Details:

- **Source dir**: `[build].outputDir ?? .mops/.build`, overridable with
  `--output <dir>` (mirrors `mops build --output`, so the recipe passes the same
  value it built with).
- **Copy-or-error**: if a source artifact is missing, error
  (`No built <ext> at <path>. Run \`mops build <name>\` first.`). Never regenerate.
- **Create parent dirs** of destinations (`mkdir -p`).
- Always overwrites — advancing the snapshot is the point.

Flags:

- `--output <dir>` — source directory (default as above).
- `--no-did` — write only the `.most` (for projects that don't want the interface
  committed). Default is to write both.
- `--check` — CI gate. No writes; exit non-zero if a destination differs from the
  built artifact (or is missing). Lets CI enforce "the committed snapshot matches the
  latest build" (`mops build && mops deployed update --check`).

**When a canister has no `[check-stable]` configured** (no anchor):

- Selected **by name** → error, pointing at `mops deployed init <name>`.
- Iterating **all** (no argument) → skip it, but report it in the summary, e.g.
  `Updated 1 canister (backend). Skipped 2 with no deployed snapshot configured: frontend, ledger. Run \`mops deployed init <name>\`.`

### `mops deployed init [canisters...]`

Prepare a canister for snapshotting so the first `mops check` has a baseline —
without hand-editing `mops.toml`. For each selected canister:

1. If `[canisters.<name>.check-stable].path` is **not** set, add it to `mops.toml`
   as `deployed/<name>.most`. Existing paths are never changed.
2. If the file at that path does not exist, create it with an empty-actor baseline:
   ```most
   // Version: 1.0.0
   actor { };
   ```

No `.did` baseline is created — mops doesn't consume the `.did`, so it simply appears
after the first `mops deployed update` (and `icp build` generates one on demand for
bindings before then). Idempotent; `--force` recreates the baseline file.

> **Caveat — TOML rewrite.** mops writes config via `writeConfig` → `TOML.stringify`
> (`cli/mops.ts:229`), which reserializes the whole file and drops comments / custom
> formatting. This already happens for `mops add` / `mops remove`, so it's accepted
> behavior, but `init` must only write when it actually adds a missing path.

### `mops deployed status [canisters...]` (extension)

Read-only drift report: per canister, whether the committed snapshot matches the
latest built artifacts (in sync / stale / missing / not built). Same info as
`update --check` but human-readable and non-failing.

## Canister selection (single vs multiple)

Identical to `mops build` / `mops check`:

- **No argument** → all canisters with `[check-stable]` configured (for
  `update`/`status`) or all `[canisters]` entries (for `init`). A single-canister
  project "just works" with a bare command — no special-casing.
- **One or more names** → only those; unknown names error (`filterCanisters`), and
  for `update` a named canister with no anchor errors (strict, like `check-stable`).

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
# once, before first deploy — configures mops.toml + writes empty .most baseline
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

1. **Did snapshot without `check-stable`.** v1 anchors the whole snapshot on
   `[check-stable].path`, so committing a `.did` requires stable tracking to be set
   up. If icp users want the `.did` committed without caring about stable checks,
   we'd need a standalone anchor (e.g. a `deployed` dir config independent of
   `check-stable`).
2. **Network/environment dimension.** `icp` environments can deploy different
   versions to `staging` vs `ic`, but `mops.toml` has one snapshot per canister
   (effectively "latest / prod"). A future per-environment path may be needed.
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
and writes the snapshot beside the `.most`.
