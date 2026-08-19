# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Contributing rules

- **Always create a PR.** Never push directly to `main`.
- **CLI design philosophy**: Follow conventions of established package managers (npm, cargo) — naming, flag style, UX patterns. Related commands must stay consistent: if `mops build` works without arguments (all canisters), then `mops check` and `mops check-stable` must too. When changing a command, review its siblings for consistency.
- **Keep docs in sync.** CLI command docs live in `docs/docs/cli/` and config reference in `docs/docs/09-mops.toml.md`. The same feature often appears in both — update all relevant pages. `docs/docs/` is the 3.x line, served at the site root; `docs/versioned_docs/version-2.x/` is the frozen 2.x snapshot, served at `/2.x`. New work goes in `docs/docs/` only. Deploy ownership: see **Docs (2.x / 3.x)** below.
- **Keep `--help` in sync with the docs.** A command's `--help` should be a concise summary of its doc page: every option and accepted argument (including the `-- <tool flags>` passthrough, via `.addHelpText`) must appear in `--help`, each with a non-empty description. Don't bloat it with prose — link-level detail stays in the docs.
- **Update the changelog.** Add entries under `## Next` in `cli/CHANGELOG.md` for any user-facing CLI changes.
- **Keep skills up to date.** When changing CLI commands or workflows, update `.agents/skills/mops-cli/SKILL.md` to match.
- **`base` is deprecated.** Use `core` for all new code, examples, and docs.
- **Pre-commit hook** runs `lint-staged + npm run check` via husky — fix TypeScript/lint errors before committing.
- **Snapshot testing strategy**: Use Jest snapshots (`cliSnapshot` / `toMatchSnapshot`) for the main use cases so the full CLI output is committed and reviewable. Corner-case and error-path tests should use targeted assertions (`toMatch`, `toBe`) without snapshots to avoid cluttering the snapshot file.

## Docs (2.x / 3.x)

Docusaurus serves two trees:

| Tree | Path in repo | Served at |
|---|---|---|
| 3.x (current) | `docs/docs/` | https://docs.mops.one (site root) |
| 2.x | `docs/versioned_docs/version-2.x/` | https://docs.mops.one/2.x |

**Who publishes.** `release.yml` is not the same file on both branches — GitHub runs the copy from the tagged commit. `main` deploys the docs canister, ungated, on stable and preview tags alike; the `v2` branch has no docs step on purpose, because a 2.x release publishing its own Docusaurus build would clobber this one. Both trees therefore ship from `main`, and a 2.x docs fix made on `v2` is invisible until it is ported here. Out-of-band redeploy, from a `main` checkout: `icp deploy docs -e ic --identity mops --no-create --yes`.

### Which files to edit

A change to the 3.x CLI is documented in `docs/docs/` only. A 2.x docs correction — a fix to something that shipped in a 2.x release — is made in `docs/versioned_docs/version-2.x/` here, and, if it also needs to land on the maintenance branch, ported to `v2` separately. `versioned_docs` is a snapshot of shipped 2.x behavior: never rewrite it to describe 3.x.

## Interactive commands (caution for agents)

Some `mops` commands prompt for input and hang in non-TTY environments (CI, agent loops). Always pass values up front:

| Interactive | Non-interactive form |
|---|---|
| `mops init` | `mops init --yes` |
| `mops bump` | `mops bump <major\|minor\|patch>` |
| `mops template` | `mops template <name>` (see `mops template --help` for names) |
| `mops toolchain use <tool>` | `mops toolchain use <tool> <version>` (e.g. `pocket-ic 15.0.0`). `latest` works but may resolve to a version incompatible with the shipped client. |
| `mops owner add\|rm <principal>` | `mops owner add\|rm <principal> --yes` |
| `mops maintainer add\|rm <principal>` | `mops maintainer add\|rm <principal> --yes` |
| `mops publish` (missing recommended `[package]` field, `CI` env unset) | Fill the field in `[package]`, or run with `CI=1` |

When adding a new command or option, prefer non-interactive (accept the value as an argument or flag). Reserve prompts for purely human-facing flows like `mops init`, and at any deprecation/missing-arg site recommend the non-interactive command verbatim (e.g. ``mops toolchain use pocket-ic 15.0.0``, not ``mops toolchain use pocket-ic``).

## What this repo is

Mops is a package manager for Motoko (the Internet Computer smart contract language). It has three main components:
- A **CLI** (`cli/`) distributed as `ic-mops` on npm
- A **backend** (`backend/`) — Motoko canisters on the Internet Computer
- A **frontend** (`frontend/`) — Svelte SPA at [mops.one](https://mops.one)

Supporting sites: `docs/` and `blog/` (Docusaurus), `cli-releases/` (Vite/Svelte).

## Commands

### Root-level (most common)
```bash
npm run lint            # ESLint
npm run fix             # Prettier + ESLint fix
npm run check           # TypeScript check for CLI + Frontend (parallel)
npm test                # mops test (Motoko) + CLI Jest tests
npm start               # Start local icp replica + deploy + all frontends
```

### CLI (`cd cli/`)
```bash
npm run build           # TypeScript compile + bundle (bun)
npm run check           # tsc --noEmit
npm test                # Jest (all tests)
npm test -- build.test.ts                    # Single test file
npm test -- --testNamePattern="pattern"      # Filter by test name
```
CLI tests require `NODE_OPTIONS="--experimental-vm-modules"` (set automatically in the script).

### Frontend (`cd frontend/`)
```bash
MOPS_FRONTEND_NETWORK=local npm run build   # Vite build; the env var is required
npm run check                         # svelte-check
```

## Architecture

### Data flow
The CLI and frontend both communicate with the **main canister** (`backend/main/`) on the Internet Computer via generated TypeScript declarations in `cli/declarations/`. Frontend copies these from CLI via `npm run decl:frontend`.

### Backend (`backend/`)
- `backend/main/main-canister.mo` — Motoko actor; manages the package registry using TrieMap-based state. Key sub-modules: `PackagePublisher.mo`, `DownloadLog.mo`, `Users.mo`, `registry/`.
- `backend/storage/` — Separate storage canisters for file chunks.
- Canister IDs are in `.icp/data/mappings/<environment>.ids.json`. Production main canister: `oknww-riaaa-aaaam-qaf6a-cai`.

### CLI (`cli/`)
- Entry: `cli/environments/nodejs/cli.ts` (Node adapter, sets up WASM bindings) re-exports `cli/cli.ts` (Commander.js setup)
- Core config/identity: `cli/mops.ts` — reads `mops.toml` up the directory tree, identity from OS-specific config dir (`~/Library/Application Support/mops/` on macOS, `~/.config/mops/` on Linux, with XDG overrides). Network selection is not persisted: `cli/api/network.ts` reads the `MOPS_NETWORK` env var and defaults to `ic`
- `cli/commands/` — command modules + subdirectories: `install/`, `test/`, `watch/`, `toolchain/` (moc, lintoko, wasmtime, pocket-ic)
- `cli/api/` — IC actor creation, network selection (ic/staging/local), package file downloads, version resolution

### Frontend
Svelte 5 + Vite 8, queries the main canister. Staging canister: `ogp6e-diaaa-aaaam-qajta-cai`.

## Key constraints

- **The CLI does not support dfx.** Nothing in `cli/` may invoke `dfx`, read `dfx.json`, or set `DFX_*` env vars. `mops sources` is the one command a dfx user can still wire up, and it is tool-agnostic on purpose — describe it by what it prints, never by who calls it. Its stdout is machine-parsed, so it must stay parseable whatever the caller.
- **Nothing in this repo touches dfx.** Every canister deploy runs on `icp` (config in `icp.yaml`) — local, staging, mainnet and `release.yml` alike — `npm run decl` uses `mops` + `icp-bindgen`, and no workflow installs dfx. Every test replica is PocketIC: `mops.toml` pins `[toolchain] pocket-ic`, which the published 2.x CLI honours over its dfx fallback, so the matrix in `mops-test.yml` needs no dfx either. Keep it that way — if a test starts needing a replica, pin the version, do not reach for dfx.
- **Canister IDs**: icp-cli cannot declare an ID in `icp.yaml`; it reads them from its own store, split by network type. Connected networks live in `.icp/data/mappings/<environment>.ids.json` and **are committed** — that is what lets a fresh checkout deploy without relinking. Managed (local) networks land in `.icp/cache/mappings/`, which is ignored. Add a new mainnet canister with `icp canister link <name> <id> -e ic` and commit the resulting mapping. Mainnet deploys pass `--no-create`, so a missing mapping fails loudly instead of creating a new canister.
- **Deploy environments** are declared explicitly in `icp.yaml`: `ic` excludes `bench`, and `staging` covers only `main` and `assets` because `docs`/`blog`/`cli` have no staging canister of their own.
- **Asset canisters are mid-migration.** `docs` runs dfinity's certified-assets canister (`@dfinity/static-site`); `assets`, `blog`, `play-frontend` and `cli` still run the legacy dfx-era `@dfinity/asset-canister`. Load-bearing differences: legacy serves unknown paths as the root `index.html` at HTTP 200 (so deploy assertions grep bodies, never statuses) and needs an `.ic-assets.json` to upload `.well-known/`; `static-site` returns real 404s, uploads `.well-known/` by default, and canonicalises clean URLs — `docs/docusaurus.config.js` must keep `trailingSlash: false`. Moving a canister between the two is a one-off `icp deploy <name> -e ic --identity mops --no-create -m reinstall` (incompatible wasms; the ID and custom domain survive, assets re-sync). `static-site` is 0.x and a minor bump is breaking by its own policy. `cli` cannot move yet: `static-site` takes a single `dir` and that canister serves two.
- **icp-cli version**: pinned in `.github/workflows/ci.yml`; the `icp.yaml` recipes are pinned by version and sha256, and the local network pins its `icp-cli-network-launcher` `version` (unpinned, every cold start asks api.github.com for the newest release — an anonymous request that gets rate-limited on CI runners, and an unpinned replica under the tests). icp-cli still makes breaking manifest changes between minor versions, so do not unpin anything and do not run `icp network update`. To move versions, bump the CI pin, the recipes and the launcher pin together and re-run the local pipeline.
- **Declarations must be regenerated** after backend changes: `npm run decl` (no replica needed). Two steps per canister: `mops generate candid` writes the `.did` from Motoko source with the pinned `[toolchain] moc`, then [`icp-bindgen`](https://www.npmjs.com/package/@icp-sdk/bindgen) turns it into `*.did.js` / `*.did.d.ts`. The `index.js` / `index.d.ts` actor factories next to them are hand-maintained — nothing regenerates those; add them by hand when adding a canister.
- **API version** in `cli/mops.ts` (`apiVersion`) and `backend/main/main-canister.mo` (`API_VERSION`) must match.

## High-risk areas (extra scrutiny)

Changes here can corrupt live registry state, break published packages, or silently affect every user's build even when all tests pass, because coverage is necessarily incomplete:

- `backend/main/**` — the production registry canister holds live state; a bad state-shape change or upgrade path can corrupt or strand data. Publish protocol lives in `PackagePublisher.mo`; published versions are immutable, so a defect there is permanent.
- Authn/authz — owner/maintainer/admin checks in `backend/main/main-canister.mo` and `Users.mo`, identity handling in `cli/mops.ts` and `cli/pem.ts`. A wrongly-accepted caller is worse than a wrongly-rejected one.
- `backend/storage/**` — package file chunks; integrity of everything already published.
- Install/resolution paths — `cli/commands/install/**`, `cli/resolve-packages.ts`, `cli/integrity.ts` (lockfile), `cli/cache.ts`, `cli/api/**`. Wrong version resolution or a corrupted cache/lockfile silently affects every downstream build.
- Release/deploy pipeline — `.github/workflows/release*.yml`, `.github/actions/deploy-canister/`, canister IDs in `.icp/data/mappings/`, environment/canister declarations in `icp.yaml`.
