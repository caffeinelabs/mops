# Spec: `mops deployed`

Status: Draft / proposal

> Sibling to [`specs/mops-candid.md`](mops-candid.md). That spec handles
> `.did` (build-input contract); this one handles `.most` (post-deploy
> snapshot).

## User story

After a Motoko canister is deployed (today: via `icp deploy` or another
deployment tool), mops needs to know about it — there's bookkeeping to do
before the **next** dev cycle so the in-repo state still corresponds to
what's on chain. **`mops deployed [canisters...]` is the post-deploy hook**
the user — or the icp-cli `sync` step — calls to communicate that fact.

In v1, the only bookkeeping is **promoting the just-built `.most` into a
committed reference path** so `mops check-stable` has the right baseline on
the next build. Future versions may also record a deploy manifest (wasm
hash, `moc` version, timestamp — see Open Questions), but the entry point
stays the same. The command is named for the situation it marks, not the
action — "I just deployed" is the story; the `.most` copy is the v1 mechanic.

### Why `.most` is in scope

`mops check-stable` compares the new code's stable signature against the
currently-deployed one. For the check to be meaningful, the on-disk
reference must advance exactly when a deploy succeeds — drift either
silently corrupts upgrade safety (false passes) or blocks valid upgrades
(false failures). Today it's maintained by hand; forget the copy and the
reference rots.

### Why `.did` is *not* in scope

`[canisters.<name>].candid` is a curated **build-input contract**, not a
deploy artifact: `mops build` subtype-checks the auto-generated interface
against it and embeds the *curated* file into the wasm
(`cli/commands/build.ts:184-200`). The same file is what `@icp-sdk/bindgen`
reads for frontend bindings (see the `icp-cli` `hello-world` template,
where one committed `backend.did` is shared between recipe and frontend).

Refreshing `.did` is interface-change-driven, not deploy-driven — and when
`candid` is set, the auto-generated `.did` mops would copy here differs
from the curated one actually embedded in the deployed wasm, so the
"snapshot" framing would be misleading. The `.did` lifecycle lives in
[`mops-candid.md`](mops-candid.md).

## Non-goals

- **No regeneration / compilation.** Copies the `.most` left by `mops
  build`; errors if missing. Keeps the reference atomically tied to the
  deployed wasm.
- **No reading from chain or wasm metadata.** Local file management only.
- **No `.did` handling** — see `mops-candid.md`.
- **No network/environment dimension** (Open Questions).

## The deployed directory

```toml
[deployed]
dir = "deployed"   # optional; default "deployed" (relative to mops.toml)
```

`mops deployed` writes `<dir>/<name>.most` per canister. Overridable per
invocation with `--dir <path>`. All canisters share the one directory.

### Synergy with `check-stable` (not coupling)

`mops deployed` does not read `[canisters.<name>.check-stable].path`.
They're wired together by `init`, which sets that field to
`<dir>/<name>.most` so the file `mops deployed` writes is exactly the
file `check-stable` reads. If the user later points the field elsewhere,
both `mops deployed` and `init` **warn** — the on-disk reference and the
configured baseline have diverged; `check-stable` won't see updates from
the hook.

## Command surface

```
mops deployed      [canisters...]   # post-deploy hook: promote .most → <dir>
mops deployed init [canisters...]   # baseline .most + [check-stable].path setup
```

Subcommands are resolved before positional args (Commander), so `init`
is effectively a reserved canister name in this command — `mops deployed
init` always means the subcommand. Not worth working around for v1; flag
in docs if it becomes a real conflict.

### `mops deployed [canisters...]`

For each selected canister, copy `<outputDir>/<name>.most` →
`<dir>/<name>.most`.

- **Source** (`<outputDir>`): `[build].outputDir ?? .mops/.build`,
  overridable with `--output <dir>` (mirrors `mops build --output`).
- **Destination** (`<dir>`): `[deployed].dir ?? deployed`, overridable with
  `--dir <path>`.
- **Copy-or-error**: missing source errors (`No built .most at <path>. Run
  \`mops build <name>\` first.`). Never regenerates.
- Creates the destination dir (`mkdir -p`); always overwrites.
- Warns when `[canisters.<name>.check-stable].path` differs from
  `<dir>/<name>.most`.

### `mops deployed init [canisters...]`

Pre-first-deploy bootstrap — separate subcommand because it also writes to
`mops.toml`. For each selected canister:

1. If `<dir>/<name>.most` does not exist, create it with an empty-actor
   baseline (`// Version: 1.0.0\nactor { };`).
2. If `[canisters.<name>.check-stable].path` is unset, set it to
   `<dir>/<name>.most`. If already set elsewhere, leave it and **warn**.

Idempotent: re-running is a no-op when both checks already hold.

> **Caveat — TOML rewrite.** mops writes config via `writeConfig` →
> `TOML.stringify` (`cli/mops.ts:229`), which reserializes the whole file
> and drops comments / custom formatting. Already accepted behavior for
> `mops add` / `mops remove`; `init` must only write when config actually
> changes.

> **Follow-up: refresh `mops init`.** `mops init` today predates
> `[canisters]` scaffolding — no canister entry, no `[check-stable]`
> wiring, no `[toolchain]` pin, still dfx-centric (fetches default packages
> keyed off `dfx --version`). A modern project setup should create a
> `[canisters.<name>]` block and then call `mops deployed init` so the
> stable-check loop is wired out of the box. Refreshing `mops init` is
> out of scope for this spec; flagged here so it's not forgotten.

## Canister selection

Identical to `mops build` / `mops check`: no argument → all `[canisters]`
entries; named → only those (unknown names error). The icp-cli integration
always uses the named form — `icp` expands the recipe once per canister, so
the `sync` step runs per canister with its own name:

```yaml
# recipes/motoko/recipe.hbs (sync phase)
sync:
  steps:
    - type: script
      commands:
        - mops deployed "{{ _.canister.name }}" --output .mops/.build
```

## Lifecycle

```
# once, before first deploy
mops deployed init backend         # writes empty .most baseline + sets [check-stable].path

# every change
mops check backend                 # new vs committed .most baseline
mops build backend                 # produces .mops/.build/backend.{wasm,did,most}
icp deploy                         # installs the wasm, then sync runs:
  mops deployed backend            #   post-deploy hook: promotes .most into deployed/
git add deployed/ && git commit
```

## Edge cases

- **Migrations**: `mops build` injects `--enhanced-migration` when
  `[canisters.<name>.migrations]` is set, so the emitted `.most` already
  reflects it; the command copies as-is.
- **`--output` mismatch**: both `mops build` and `mops deployed` default to
  `[build].outputDir ?? .mops/.build`; the recipe passes `--output`
  explicitly to guarantee a match.
- **Stale/empty output dir**: copy-or-error, by design — prevents promoting
  an artifact that doesn't correspond to a fresh build.

## Open questions

1. **Per-canister directory override.** Global `[deployed].dir` + `--dir` is
   the v1 surface. A per-canister override could be added later if needed.
2. **Network/environment dimension.** `icp` environments can deploy
   different versions to `staging` vs `ic`; the reference is single
   (effectively "latest / prod"). A future per-environment directory may
   be needed.
3. **Deployed manifest** (speculative). Record wasm hash / `moc` version /
   timestamp per canister to make "what is deployed" auditable from the
   repo without touching the chain.
