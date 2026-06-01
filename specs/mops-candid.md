# Spec: `mops generate candid`

Status: Draft / proposal

> Sibling to [`specs/mops-deployed.md`](mops-deployed.md). That spec
> handles `.most` (post-deploy snapshot); this one handles `.did`
> (build-input contract).

`mops generate` is a noun-namespace for source-derived artifacts. v1 ships
one member (`candid`); future members like `mops generate most` or `mops
generate migration` can join later without restructuring.

## User story

A Motoko canister's Candid interface lives in two places:

- **Embedded in the wasm** as `candid:service` metadata, written by every
  `mops build` (the deployed canister self-describes).
- **As an on-disk `.did` file** that downstream tooling reads — most
  importantly `@icp-sdk/bindgen` (the Vite plugin generates frontend
  TypeScript clients from a file path, not the wasm). The `icp-cli`
  `hello-world` template demonstrates the canonical pattern: one committed
  `backend.did` shared by recipe (build input) and frontend (bindgen
  input).

mops surfaces this via **`[canisters.<name>].candid`** — an optional path.
When set, `mops build` subtype-checks the auto-generated interface against
that file and **embeds the file** verbatim into the wasm as
`candid:service` (`cli/commands/build.ts:184-200`). It's a *curated,
ahead-of-code contract*.

What's missing is **maintenance**. When the Motoko interface changes,
someone has to write the new `.did` by hand. When the field is unset,
there's no committed `.did` at all — bindgen has only
`.mops/.build/<name>.did`, which is private and unstable.

**`mops generate candid <canister>`** fills that gap. It (re)generates
the curated `.did` from current source:

- if `[canisters.<name>].candid` is **set** → overwrite that file;
- if **unset** → write to a default path (`<name>.did` next to
  `main`) *and* set the field in `mops.toml`.

The lifecycle is **interface-change-driven**, not deploy-driven. Refresh
when the interface changes; commit; bindgen and `mops build` pick up the
new file on the next read.

## Non-goals

- **No interface diffing / approval workflow.** Always overwrites. Hand
  edits (doc comments, reordering) are lost — edit by hand when drift is
  intentional.
- **No standalone drift command.** CI drift detection lives in
  `mops check`, not here (see § "Interaction with `mops check`").
- **No wasm metadata interaction.** Embedding is `mops build`'s job;
  unchanged.
- **No on-chain reads.** Generated from local source, never fetched from
  the deployed canister.
- **No deploy coupling.** Independent of `mops deployed`.

## Command surface

```
mops generate candid [canisters...]     # (re)generate curated .did from source
```

Flags:

- `-o <path>` / `--output <path>` — one-off override (single-canister
  only). Writes to `<path>` and does **not** touch `mops.toml`. Use for
  ad-hoc generation to a non-tracked location; ignore it for the normal
  flow. Without this flag, the field-or-default logic above applies.

Canister selection mirrors `mops build`: no argument → all `[canisters]`
entries; named → only those (unknown names error).

## How the `.did` is generated

Invokes `moc --idl` directly (no `.wasm` / `.most` / `ic-wasm` side
effects). The moc-argument logic — sources, packages, actor aliases,
canister `args`, migration flags — must be **extracted from `build.ts`
into a shared helper** (e.g. `buildMocArgs(canister)`) and called from
both code paths. DRY: a single source of truth for "how moc is invoked
for canister X" prevents the two flows from drifting (which would risk
`mops build` failing the subtype check on a freshly-regenerated `.did`).

The `mops.toml` write (when needed) uses the same `writeConfig` /
`TOML.stringify` machinery as `mops deployed init`; see the TOML-rewrite
caveat there.

## Destination path

Priority order:

1. `-o <path>` if given — write there; never updates `mops.toml`. If the
   field is also set, the field-pointed file is left untouched (and now
   stale relative to source — caller's responsibility).
2. `[canisters.<name>].candid` if set — overwrite in place; no toml
   update.
3. Default: `<name>.did` in `dirname([canisters.<name>].main)` — write
   file *and* set the field.

Any resolved path inside `.mops/` is rejected — see Edge cases. The
"next to `main`" default works for any layout: `main = src/Backend.mo`
→ `src/backend.did`, `main = backend/app.mo` → `backend/backend.did`,
`main = Main.mo` → `backend.did` at project root.

## Interaction with `mops check`

A committed `[canisters.<name>].candid` can drift from the current Motoko
source (someone edited the source, forgot to regenerate). The natural
home for that drift check is **`mops check`**, not a sibling
`mops generate candid check` — mops already has one place for "is this
project healthy?" and a Candid drift gate fits alongside type-checking
and stable-compatibility.

> **Follow-up: extend `mops check`.** If drift detection isn't already
> in `mops check`, add it: compare `[canisters.<name>].candid` against
> what moc would auto-generate from current source; warn (or error
> under `--strict`) when they differ. Subsumes the standalone CI-gate
> role we'd otherwise need here. Out of scope for this spec; flagged so
> it's not forgotten.

## Lifecycle

```
# initial setup (per canister), once
mops generate candid backend     # writes <dirname(main)>/backend.did, sets [canisters.backend].candid

# every interface change
# (edit Motoko source...)
mops generate candid backend     # refresh from source
git add src/backend.did mops.toml

# CI
mops check                       # also catches stale .did (see "Interaction with mops check")
```

`mops generate candid` is independent of `mops deployed`:

| When | Command |
|---|---|
| Motoko interface changes | `mops generate candid <name>` (refresh curated `.did`) |
| Just deployed to chain | `mops deployed <name>` (snapshot `.most`) |
| First-time setup | `mops generate candid <name>` + `mops deployed init <name>` |

## Edge cases

- **No `main`** → error before invoking moc (same check as `mops build`).
- **Resolved destination inside `.mops/`** → reject, regardless of source
  (`-o`, field, default). The point is a user-visible, committable path;
  no exception even if the user mis-set the field.
- **`-o` collides with another canister's `candid`** → warn. Sharing a
  `.did` path between canisters is almost always a mistake.
- **moc fails** → don't touch destination or `mops.toml`. Surface the
  error verbatim.
- **`candid` set but file doesn't exist** → overwrite (create) at that
  path. The field is source of truth for *where*, not *whether*.
- **Multi-canister + `-o`** → error. `-o` is single-canister only.

## Out of scope

- **`[candid].dir` config.** Global directory for `.did` files
  (`did/<name>.did`), analogous to `[deployed].dir`. Default
  (next to `main`) keeps `.did` co-located with source, which is what
  we want for now.
- **Preserving curated edits.** Users may hand-curate `.did` with doc
  comments / method ordering moc doesn't preserve. v1 overwrites; a
  future `--merge` mode could detect and warn.
- **Future `mops generate` members.** `mops generate most`, `mops
  generate migration <name>`, etc. share this namespace; each gets its
  own spec when it lands and inherits the conventions (canister
  selection, `-o`, error semantics).
