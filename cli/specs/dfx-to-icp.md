# Spec: `dfx-to-icp` migration

Status: Phase 1 merged · Phase 2a in flight
Owner: mops CLI
Tracking: [LANG-1311](https://linear.app/...)

## Motivation

`dfx` is being superseded by [`icp-cli`](https://cli.internetcomputer.org/).
Mops integrates with `dfx` in three places:

1. **Frontend SDKs** (`@dfinity/agent`, `@dfinity/principal`, …) — done in Phase 1.
2. **Internal dev pipeline** (`dfx.json`, `dfx start/deploy/generate` in root
   `package.json` scripts).
3. **CLI runtime** (`getDfxVersion`, `dfx.json` parsing, `--replica dfx`).

Migration order: **dogfood internally first** (Phase 2), then make the CLI
`icp.yaml`-aware (Phase 4), then deprecate `--replica dfx` for users (Phase 3).
The credibility argument from `NEXT-MAJOR.md` applies — we shouldn't deprecate
what we still rely on ourselves.

## Spike findings

### Q1 — Does `icp-cli` have a `packtool` extension point?

**No direct equivalent.** `icp.yaml` has no global `defaults.build.packtool`
hook. Build configuration is per-canister.

**Mops integration path**: the official [`@dfinity/motoko` recipe][motoko-recipe]
embeds `$(mops sources)` directly in the `moc` invocation:

```text
$(mops toolchain bin moc) "{{ main }}" ... $(mops sources) -o "$ICP_WASM_OUTPUT_PATH"
```

So a Motoko canister using mops looks like:

```yaml
canisters:
  - name: backend
    recipe:
      type: "@dfinity/motoko@v4.1.0"
      configuration:
        main: src/main.mo
```

Users don't pass anything themselves — the recipe handles `mops sources` and
`mops toolchain bin moc` transparently. `mops.toml` must sit next to `icp.yaml`
(inline canisters) or each `canister.yaml` (path-based).

If a user opts out of recipes and writes raw `build.steps`, they must inline
`$(mops sources)` themselves — there is **no shared "before every build" hook**.

**Implication for our `init` command**: when scaffolding for icp-cli, we should
either (a) recommend the recipe, or (b) emit a `build.steps` script with
`$(mops sources)` inlined. We don't need a new packtool integration — we just
need to know which `icp.yaml` style we're scaffolding into.

### Q2 — Standalone declaration generation outside Vite

**No `icp generate` subcommand.** [icp-cli docs][icp-bindgen-concept] explicitly
delegate binding generation to [`@icp-sdk/bindgen`][bindgen-cli]. It runs
standalone:

```bash
npm i -D @icp-sdk/bindgen
icp-bindgen --did-file backend/main/main.did --out-dir cli/declarations/main
```

It takes a `.did` file, **not a canister name**, so we need the `.did` on disk
first. For Motoko sources we can extract via:

```bash
$(mops toolchain bin moc) --idl $(mops sources) -o backend/main/main.did backend/main/app.mo
```

Or use `candid-extractor` against a built wasm.

**Output shape differs from `dfx generate`** ([docs][bindgen-structure]):

| `dfx generate <name>` | `icp-bindgen --out-dir out` |
| --- | --- |
| `out/index.js` | `out/<name>.ts` (combined JS + types) |
| `out/index.d.ts` | — |
| `out/<name>.did.js` | `out/declarations/<name>.did.js` |
| `out/<name>.did.d.ts` | `out/declarations/<name>.did.d.ts` |

`--declarations-flat` collapses `declarations/` into `--out-dir`.
`--actor-disabled` skips the `<name>.ts` wrapper, leaving committed
`index.{js,d.ts}` shims in place. See **Phase 2c** below for the recommended
flow + caveats discovered while validating against our actual `main.did`.

### Q3 — `getDefaultPackages("")` behavior

`backend/main/registry/getDefaultPackages.mo` switches on `dfxVersion`:

- Versions `0.9.0` … `0.27.0` map to a pinned `base` version.
- **Wildcard `_`** (matches `""` and any unknown version) returns
  `[("core", <highest version in registry>)]`, or `[]` if `core` isn't
  published yet.

Today `mops init` ([`cli/commands/init.ts:244`](cli/commands/init.ts)) reads
`dfxVersion` from `dfx.json`, falls back to `dfx --version`, and on failure
passes `""` — so an icp-only user already gets the right answer (latest
`core`). **No backend or `init` change is needed for Phase 4.**

When we drop the `dfx --version` probe and `dfx.json` lookup, we just keep
passing `""` and the user automatically lands on `core`. That aligns with the
"`base` is deprecated, use `core`" workspace rule.

The function signature
`getDefaultPackages(dfxVersion : Text) : async [(PackageName, PackageVersion)]`
should stay — renaming or repurposing the parameter is a backend ABI change
with no upside (callers already pass `""` when there's no dfx).

## Phase 2 plan

Phase 2 splits into three follow-on PRs, ordered by risk.

### Phase 2a — foundation (this PR)

1. Add `icp.yaml` mirroring `dfx.json`. Six canisters: `main`, `bench`
   (Motoko recipe), `assets`, `docs`, `blog`, `cli` (asset-canister recipe).
   Local network pinned to `127.0.0.1:4943` so the existing Vite `/api` proxy
   keeps working when devs opt in to `icp network start`.
2. `.gitignore` adds `.icp/cache/`. (Track `.icp/data/` later when we have
   mainnet IDs to record there.)
3. `dfx.json`, npm scripts, CI workflows, and Vite are unchanged — daily dev
   stays on `dfx` until Phase 2b lands.

Validation: `icp project show` parses the file and lists all six canisters.

### Phase 2b — flip dev pipeline

1. Root `package.json`: swap `replica`, `deploy-local`, and `decl:cli` to
   `icp` equivalents (`icp network start`, `icp deploy -e local`, the
   `icp-bindgen` flow described below).
2. `frontend/vite.config.ts`: read canister IDs from
   `.icp/cache/mappings/.ids.json` (managed/local) with a `.dfx/local/...`
   fallback. **Validate the file format first** — confirmed by running `icp
   deploy -e local` once on a real machine before the PR is opened.
3. `.github/workflows/ci.yml`: install icp-cli (no published `setup-icp`
   action yet — likely `npm i -g @icp-sdk/icp-cli` or curl install). Keep
   `setup-dfx` until `mops watch` and the CLI test suite no longer require
   `dfx`.
4. `mops watch` (`cli/commands/watch/deployer.ts`,
   `cli/commands/watch/generator.ts`) still shells out to `dfx ping/canister
   create/generate`. Either update those to detect icp first, or document
   that `mops watch` requires `dfx` for now.

### Phase 2c — regenerate declarations

`icp-bindgen` is functionally compatible with the existing `cli/declarations/`
shape (with `--declarations-flat --actor-disabled`), but the output has
notable cosmetic differences from `dfx generate`:

- Prepends `/* eslint-disable */` + `// @ts-nocheck` + autogen banner.
- Reorders fields inside generated records — appears non-deterministic
  between runs, which would create merge churn.
- Narrows blob types from `Uint8Array | number[]` to just `Uint8Array`. This
  is a **semantic** change. `cli/integrity.ts:51-58` mirrors the wider type;
  consumers that pass `number[]` directly would break.

Recommended approach for Phase 2c: regenerate everything in one PR, accept
the large-but-mostly-cosmetic diff in `cli/declarations/` and
`frontend/declarations/`, and fix the few real consumer types that were
relying on `number[]`. Re-emit `index.{js,d.ts}` from a hand-maintained
template (since `--actor-disabled` skips bindgen's actor wrapper).

`decl:cli` becomes:

```bash
"$(mops toolchain bin moc)" --idl backend/main/main-canister.mo $(mops sources) \
  -o cli/declarations/main/main.did
npx -p @icp-sdk/bindgen icp-bindgen \
  --did-file cli/declarations/main/main.did \
  --out-dir cli/declarations/main \
  --declarations-flat --actor-disabled --force
# index.{js,d.ts} are committed and untouched
```

The same flow runs for `bench`. Verified end-to-end against today's
`backend/main/main-canister.mo` (output structurally matches the committed
declarations).

Production deploys (`release.yml`, `deploy-staging`, `deploy-ic`) stay on
`dfx` until we have a separate PR that pre-populates `.icp/data/mappings/.ids.json`
with our existing mainnet canister IDs (`2d2zu-...`, `ogp6e-...`). `icp.yaml`
has no `specified_id` equivalent — pre-existing canisters must be recorded in
the IDs mapping file before deploy.

## Phase 4 plan

`cli/mops.ts` and `cli/commands/watch/parseDfxJson.ts` need to read either
`icp.yaml` or `dfx.json`. Introduce a `project-config.ts` helper that returns a
unified canister list. Keep `--replica dfx` working until Phase 3 closes it.

## Phase 3 plan

After Phase 2 + 4 ship: emit a deprecation warning when `--replica dfx` is
used or when only `dfx.json` is present. Removal target: next major.

## Open questions resolved

- ~~Does `icp-cli` have a `packtool` hook?~~ No — recipe pattern instead.
- ~~`dfx generate` standalone replacement?~~ `icp-bindgen` from
  `@icp-sdk/bindgen`, with output-shape caveat.
- ~~`getDefaultPackages("")` behavior?~~ Falls through to latest `core`.
- ~~`icp.yaml` schema works for our canisters?~~ Yes — `icp project show`
  parses the file with all six canisters (Phase 2a).

## References

- [`@dfinity/motoko` recipe source][motoko-recipe]
- [icp-cli configuration reference][icp-config]
- [`icp-bindgen` CLI usage][bindgen-cli]
- [`icp-bindgen` output structure][bindgen-structure]
- [icp-cli "binding generation" concept page][icp-bindgen-concept]

[motoko-recipe]: https://github.com/dfinity/icp-cli-recipes/blob/main/recipes/motoko/recipe.hbs
[icp-config]: https://cli.internetcomputer.org/0.2/reference/configuration/
[icp-bindgen-concept]: https://cli.internetcomputer.org/0.2/concepts/binding-generation/
[bindgen-cli]: https://js.icp.build/bindgen/latest/cli/
[bindgen-structure]: https://js.icp.build/bindgen/latest/structure
