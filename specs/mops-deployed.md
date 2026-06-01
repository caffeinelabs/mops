# Spec: `mops deployed`

Status: Draft / proposal

## Problem

`mops build` emits three artifacts from a single `moc` invocation into the output
dir (`.mops/.build` by default): `<name>.wasm`, `<name>.did`, `<name>.most`. They
are internally consistent by construction.

The `.wasm` is what gets deployed. The `.most` (stable signature) is the **deployed
reference**: the input to the next upgrade's stable-compatibility check —

- `mops check-stable` runs `moc --stable-compatible <deployed.most> <new.most>`.

For that check to be meaningful, the committed reference
(`[canisters.<name>.check-stable].path`) **must match the code currently running
on-chain**. Today that's maintained by hand: deploy, then remember to copy the new
`.most` into the committed path. Forget, and the reference drifts from on-chain
reality → false passes (silent data loss on upgrade) or false failures.

`mops deployed` makes advancing the deployed reference a first-class, scriptable
step that the [icp-cli Motoko recipe](https://github.com/dfinity/icp-cli-recipes)
can call in its post-install `sync` phase.

## Goals

- Promote the **already-built** stable signature (`.most`) into the configured
  reference path.
- Bootstrap the reference — both the baseline file **and** its `mops.toml` entry —
  before the first deployment, so users don't configure paths by hand.
- Be DRY: reference paths live only in `mops.toml`; callers pass only a canister
  name (mirrors how the recipe already delegates building via `mops build <name>`).
- Follow existing canister-selection conventions (`mops build` / `mops check`).

## Non-goals

- **No regeneration / compilation.** The command never runs `moc`. It strictly
  reuses the artifacts left by `mops build`, so the reference can never decouple
  from the deployed wasm. If the artifacts are missing, it errors.
- **No reading from chain or wasm metadata.** Files are managed locally and
  committed to the repo.
- **No auto-management of the embedded `candid` file** (see asymmetry below).
- **No network/environment dimension** (see Open Questions).

## Stable vs Candid: an important asymmetry

The `.most` and `.did` references are **not** symmetric in mops, which determines
what `mops deployed` can safely manage.

- **`.most` via `[check-stable].path`** is a pure *deployed snapshot*. mops only ever
  reads it (`moc --stable-compatible <deployed.most> <new.most>`) and never embeds
  it anywhere. It is meant to lag behind the working tree — it represents what is
  on-chain. Advancing it after a deploy is exactly correct. ✅ safe to auto-manage.

- **`.did` via `[canisters.<name>].candid`** is a *curated interface input*, not a
  snapshot. During `mops build`, when `candid` is set, mops:
  1. checks the freshly generated interface is compatible with the committed
     `candid` file, then
  2. **embeds the committed `candid` file** (not the generated one) into the wasm as
     `candid:service` (`cli/commands/build.ts:184-200`).

  So `candid` is expected to be *ahead of or equal to* the code — you declare the
  interface you want and the build conforms to it. If `mops deployed` overwrote
  `candid` with the just-built `.did` *after* deploying, the reference would lag one
  version behind, and the **next** build would embed the previous interface into the
  new wasm — i.e. ship a wasm advertising the wrong Candid. ❌ unsafe to auto-manage
  by overwriting `candid`.

**Conclusion:** `mops deployed` manages the **stable** reference. Candid is
intentionally out of scope for auto-update in v1 — its backward-compat is already
enforced by the curated `candid` + build check. A rolling *deployed-candid*
snapshot, if ever wanted, needs its **own** config field, separate from the embedded
`candid` (see Open Questions). This also directly answers "what if there's a most
path but no candid?": that is the **normal, recommended** configuration, not a
degraded one.

## Why "deployed update", not "deployed sync"

`update`, for these reasons:

- `mops sync` already exists and means "reconcile `mops.toml` deps with code
  imports". Reusing `sync` for a different reconcile target is confusing.
- `icp` already calls its post-install phase `sync`; `mops deployed sync` inside an
  `icp sync` step reads badly.
- The action is "advance the saved reference forward to the just-deployed version"
  — an update/bump, not a two-way reconciliation. It matches the existing semantics
  of `mops update` and `mops toolchain update` ("move forward to newer").

## Command surface

```
mops deployed update [canisters...]   # promote built .most → reference path
mops deployed init   [canisters...]   # configure + create baseline reference (first deploy)
mops deployed status [canisters...]   # (extension) report drift, no writes
```

`deployed` is a subcommand group, like `mops toolchain`.

### `mops deployed update [canisters...]`

The main use case. For each selected canister `<name>`, copy
`<outputDir>/<name>.most` → `[canisters.<name>.check-stable].path`.

- **Source dir**: `[build].outputDir ?? .mops/.build`, overridable with
  `--output <dir>` (mirrors `mops build --output`, so the recipe passes the same
  value it built with).
- **Copy-or-error**: if `<outputDir>/<name>.most` is missing, error
  (`No built stable signature at <path>. Run \`mops build <name>\` first.`). Never
  regenerate.
- **Create parent dirs** of the destination (`mkdir -p`).
- Always overwrites the destination — advancing the reference is the point.

Flags:

- `--output <dir>` — source directory (default as above).
- `--check` — CI gate. No writes; exit non-zero if the destination differs from the
  built `.most` (or is missing). Lets CI enforce "the committed reference matches the
  latest build" (run `mops build && mops deployed update --check`).

**When a canister has no `check-stable` configured:**

- Selected **by name** → error, pointing at `mops deployed init <name>`.
- Iterating **all** (no argument) → skip it, but report it in the summary so the user
  isn't left wondering why nothing happened, e.g.
  `Updated 1 canister (backend). Skipped 2 with no deployed reference: frontend, ledger. Run \`mops deployed init <name>\` to set one up.`

### `mops deployed init [canisters...]`

Prepare a canister for deployed-reference tracking so the very first `mops check`
has a baseline — without the user editing `mops.toml` by hand. For each selected
canister:

1. If `[canisters.<name>.check-stable].path` is **not** set, add it to `mops.toml`
   using the default convention `deployed/<name>.most`. Existing paths are never
   changed.
2. If the file at that path does not exist, create it with an empty-actor baseline:
   ```most
   // Version: 1.0.0
   actor { };
   ```

Idempotent: re-running is a no-op once configured and present. `--force` recreates
the baseline file (it never rewrites an existing configured path).

This replaces the manual "create a trivial `.most`" step currently documented for
new projects.

> **Candid is not configured by `init`.** Setting `candid` changes build behavior
> (compat check + embedding), so `init` must not add it implicitly. Users who want a
> curated `candid` interface set it themselves, as today.

> **Caveat — TOML rewrite.** mops writes config via `writeConfig` →
> `TOML.stringify` (`cli/mops.ts:229`), which reserializes the whole file and drops
> comments / custom formatting. This already happens for `mops add` / `mops remove`,
> so it is accepted behavior, but `init` should only write when it actually adds a
> missing path (no-op writes must be avoided).

### `mops deployed status [canisters...]` (extension)

Read-only drift report: for each canister, show whether the committed reference
matches the latest built `.most` (in sync / stale / missing / not built). Same
information as `update --check` but human-readable and non-failing.

## Canister selection (single vs multiple)

Identical to `mops build` / `mops check`:

- **No argument** → all canisters that have a stable reference configured (for
  `update`/`status`) or all `[canisters]` entries (for `init`). A single-canister
  project therefore "just works" with a bare command — no special-casing.
- **One or more names** → only those canisters; unknown names error
  (`filterCanisters`), and for `update` a named canister with no reference config
  errors (strict, like `check-stable`'s `required` path).

The icp-cli integration always uses the **named** form. `icp` expands the recipe
**once per canister**, so the recipe's `sync` step runs per canister with its own
name. Multi-canister projects are handled by `icp` iterating, not by the command
fanning out:

```yaml
# recipes/motoko/recipe.hbs (sync phase)
sync:
  steps:
    - type: script
      commands:
        - mops deployed update "{{ _.canister.name }}" --output .mops/.build
```

The no-argument "all" form is for humans running mops directly.

## Configuration

No new `mops.toml` fields. `update` reads the existing stable reference path; `init`
can populate it:

```toml
[canisters.backend]
main = "src/backend/main.mo"

[canisters.backend.check-stable]
path = "deployed/backend.most"   # ← read by update; added by init if missing
```

This is the DRY payoff: the same path that is already the check **input** is the
promotion **output**. Callers (recipe, CI, humans) reference only the canister name.

## Lifecycle

```
# once, before first deploy — configures mops.toml + writes empty baseline
mops deployed init backend

# every change
mops check backend                  # new vs committed baseline
mops build backend                  # produces .mops/.build/backend.{wasm,did,most}
icp deploy                          # installs the wasm, then sync runs:
  mops deployed update backend      #   advances baseline → committed path
git add ... && git commit           # commit the new deployed reference
```

## Edge cases

- **Migrations**: `mops build` already injects `--enhanced-migration` when
  `[canisters.<name>.migrations]` is set, so the emitted `.most` reflects it. The
  command copies as-is; no migration awareness needed.
- **`--output` mismatch**: the recipe forces `--output .mops/.build` for its build;
  `mops deployed update` must read the same dir. Both default to
  `[build].outputDir ?? .mops/.build`; the recipe passes `--output` explicitly to
  guarantee a match.
- **Standalone `update` with a stale/empty output dir**: errors (copy-or-error).
  Intentional — prevents promoting artifacts that don't correspond to a fresh build.

## Open questions

1. **Default path convention for `init`.** Proposed `deployed/<name>.most`. A
   `deployed/` dir is self-documenting and groups references; alternatives are next
   to source or an `.old/` mirror (as in current docs). Pick one.
2. **Network/environment dimension.** `icp` environments can deploy different
   versions to `staging` vs `ic`, but `mops.toml` has a single reference per
   canister. The reference currently means "the latest deployed version" (typically
   prod). A future `--env`/per-environment reference path may be needed if teams
   deploy divergent builds.
3. **Deployed-candid reference (separate field).** If teams want rolling Candid
   backward-compat against the *deployed* interface (not just a curated one), add a
   dedicated field — e.g. `[canisters.<name>.check-candid].path` — that mops reads
   for a `--candid-compatible`-style check and that `mops deployed update` may safely
   write, **without** touching the embedded `candid`. Out of scope for v1.
4. **Deployed manifest (speculative).** `mops deployed` could also record a small
   manifest (wasm hash, `moc` version, timestamp) per canister to make "what is
   deployed" auditable from the repo — without touching the chain. Out of scope for
   v1.
