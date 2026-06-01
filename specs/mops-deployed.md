# Spec: `mops deployed`

Status: Draft / proposal

## Problem

`mops build` emits three artifacts from a single `moc` invocation into the output
dir (`.mops/.build` by default): `<name>.wasm`, `<name>.did`, `<name>.most`. They
are internally consistent by construction.

The `.wasm` is what gets deployed. The `.did` (Candid interface) and `.most`
(stable signature) are the **deployed reference**: the inputs to the next upgrade's
safety checks —

- `mops check-stable` runs `moc --stable-compatible <deployed.most> <new.most>`,
- candid compatibility compares `<new.did>` against `[canisters.<name>].candid`.

For these checks to be meaningful, the committed reference (`[canisters.<name>].candid`
and `[canisters.<name>.check-stable].path`) **must match the code currently running
on-chain**. Today that's maintained by hand: deploy, then remember to copy the new
`.did`/`.most` into the committed paths. Forget, and the reference drifts from
on-chain reality → false passes (silent data loss on upgrade) or false failures.

`mops deployed` makes advancing the deployed reference a first-class, scriptable
step that the [icp-cli Motoko recipe](https://github.com/dfinity/icp-cli-recipes)
can call in its post-install `sync` phase.

## Goals

- Promote the **already-built** `.did`/`.most` into the configured reference paths.
- Bootstrap baseline reference files before the first deployment.
- Be DRY: reference paths live only in `mops.toml`; callers pass only a canister
  name (mirrors how the recipe already delegates building via `mops build <name>`).
- Follow existing canister-selection conventions (`mops build` / `mops check`).

## Non-goals

- **No regeneration / compilation.** The command never runs `moc`. It strictly
  reuses the artifacts left by `mops build`, so the reference can never decouple
  from the deployed wasm. If the artifacts are missing, it errors.
- **No reading from chain or wasm metadata.** Files are managed locally and
  committed to the repo.
- **No network/environment dimension** (see Open Questions).

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
mops deployed update [canisters...]   # promote built .did/.most → reference paths
mops deployed init   [canisters...]   # create baseline reference files (first deploy)
mops deployed status [canisters...]   # (extension) report drift, no writes
```

`deployed` is a subcommand group, like `mops toolchain`.

### `mops deployed update [canisters...]`

The main use case. For each selected canister `<name>`:

| Artifact | Source                         | Destination                                  |
|----------|--------------------------------|----------------------------------------------|
| Candid   | `<outputDir>/<name>.did`       | `[canisters.<name>].candid`                  |
| Stable   | `<outputDir>/<name>.most`      | `[canisters.<name>.check-stable].path`       |

- **Source dir**: `[build].outputDir ?? .mops/.build`, overridable with
  `--output <dir>` (mirrors `mops build --output`, so the recipe can pass the same
  value it built with).
- **Copy-or-error**: if a source artifact is missing, error
  (`No built artifact found at <path>. Run \`mops build <name>\` first.`). Never
  regenerate.
- **Create parent dirs** of destinations (`mkdir -p`), e.g.
  `.old/src/backend/dist/backend.most`.
- **Missing destination config**: if a canister has `candid` but no `check-stable`
  (or vice-versa), update the configured one and note the skipped one. If a canister
  selected **by name** has neither configured → error. When iterating **all**
  canisters, silently skip those with neither.
- Always overwrites the destination — advancing the reference is the point.

Flags:

- `--output <dir>` — source directory (default as above).
- `--check` — CI gate. No writes; exit non-zero if any destination differs from the
  built artifact (or is missing). Lets CI enforce "the committed reference matches
  the latest build" (run `mops build && mops deployed update --check`).

### `mops deployed init [canisters...]`

Bootstrap the reference before the first deployment, so the very first
`mops check` has a baseline to compare against. For each selected canister, create
any configured reference file that does **not** yet exist:

- `check-stable` path ← empty-actor stable signature:
  ```most
  // Version: 1.0.0
  actor { };
  ```
- `candid` path ← empty service: `service : {}` (any future interface is a valid
  supertype, so the first candid check passes). *Exact baseline content TBD — see
  Open Questions.*

Never overwrites existing files; `--force` to recreate. This replaces the manual
"create a trivial `.most`" step currently documented for new projects.

### `mops deployed status [canisters...]` (extension)

Read-only drift report: for each canister, show whether the committed reference
matches the latest built artifact (in sync / stale / missing / not built). Same
information as `update --check` but human-readable and non-failing. Useful before
deciding to deploy.

## Canister selection (single vs multiple)

Identical to `mops build` / `mops check`:

- **No argument** → all canisters that have a reference configured. A
  single-canister project therefore "just works" with a bare
  `mops deployed update` — no special-casing.
- **One or more names** → only those canisters; unknown names error
  (`filterCanisters`), and a named canister with no reference config errors
  (strict, like `check-stable`'s `required` path).

The icp-cli integration always uses the **named** form: `icp` expands the recipe
**once per canister**, so the recipe's `sync` step runs per canister with its own
name. Multi-canister projects are thus handled by `icp` iterating, not by the
command fanning out:

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

No new `mops.toml` fields. The command reads the existing reference paths:

```toml
[canisters.backend]
main   = "src/backend/main.mo"
candid = "src/backend/backend.did"            # ← did destination (also the compat-check input)

[canisters.backend.check-stable]
path = ".old/src/backend/dist/backend.most"   # ← most destination (also the stable-check input)
```

This is the DRY payoff: the same paths that are already the check **inputs** are the
promotion **outputs**. Callers (recipe, CI, humans) reference only the canister name.

## Lifecycle

```
# once, before first deploy
mops deployed init backend          # writes empty baselines

# every change
mops check backend                  # new vs committed baselines
mops build backend                  # produces .mops/.build/backend.{wasm,did,most}
icp deploy                          # installs the wasm, then sync runs:
  mops deployed update backend      #   advances baselines → committed paths
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
- **Standalone `mops deployed update` with a stale/empty output dir**: errors
  (copy-or-error). This is intentional — it prevents promoting artifacts that don't
  correspond to a fresh build.

## Open questions

1. **Network/environment dimension.** `icp` environments can deploy different
   versions to `staging` vs `ic`, but `mops.toml` has a single reference per
   canister. The reference currently means "the latest deployed version" (typically
   prod). A future `--env`/per-environment reference path may be needed if teams
   deploy divergent builds.
2. **Candid baseline for `init`.** Confirm `service : {}` is accepted by the candid
   compatibility check as a valid "old" interface, or pick the right empty form.
3. **Deployed manifest (speculative).** `mops deployed` could also record a small
   manifest (wasm hash, `moc` version, timestamp) per canister to make "what is
   deployed" auditable from the repo — without touching the chain. Out of scope for
   v1.
