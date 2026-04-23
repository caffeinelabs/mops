# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Contributing rules

- **Always create a PR.** Never push directly to `main`.
- **CLI design philosophy**: Follow conventions of established package managers (npm, cargo) — naming, flag style, UX patterns. Related commands must stay consistent: if `mops build` works without arguments (all canisters), then `mops check` and `mops check-stable` must too. When changing a command, review its siblings for consistency.
- **Keep docs in sync.** CLI command docs live in `docs/docs/cli/` and config reference in `docs/docs/09-mops.toml.md`. The same feature often appears in both — update all relevant pages.
- **Update the changelog.** Add entries under `## Next` in `cli/CHANGELOG.md` for any user-facing CLI changes.
- **Keep skills up to date.** When changing CLI commands or workflows, update `.agents/skills/mops-cli/SKILL.md` to match.
- **Pre-commit hook** runs `lint-staged + npm run check` via husky — fix TypeScript/lint errors before committing.
- **Snapshot testing strategy**: Use Jest snapshots (`cliSnapshot` / `toMatchSnapshot`) for the main use cases so the full CLI output is committed and reviewable. Corner-case and error-path tests should use targeted assertions (`toMatch`, `toBe`) without snapshots to avoid cluttering the snapshot file.

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
npm start               # Start local dfx replica + deploy + all frontends
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
npm run build           # Vite build
npm run check           # svelte-check
```

## Architecture

### Data flow
The CLI and frontend both communicate with the **main canister** (`backend/main/`) on the Internet Computer via generated TypeScript declarations in `cli/declarations/`. Frontend copies these from CLI via `npm run decl:frontend`.

### Backend (`backend/`)
- `backend/main/main-canister.mo` — Motoko actor; manages the package registry using TrieMap-based state. Key sub-modules: `PackagePublisher.mo`, `DownloadLog.mo`, `Users.mo`, `registry/`.
- `backend/storage/` — Separate storage canisters for file chunks.
- Canister IDs are in `dfx.json`. Production main canister: `2d2zu-vaaaa-aaaak-qb6pq-cai`.

### CLI (`cli/`)
- Entry: `cli/environments/nodejs/cli.ts` (Node adapter, sets up WASM bindings) re-exports `cli/cli.ts` (Commander.js setup)
- Core config/identity: `cli/mops.ts` — reads `mops.toml` up the directory tree, identity from OS-specific config dir (`~/Library/Application Support/mops/` on macOS, `~/.config/mops/` on Linux, with XDG overrides), network from `network.txt`
- `cli/commands/` — command modules + subdirectories: `install/`, `test/`, `watch/`, `toolchain/` (moc, lintoko, wasmtime, pocket-ic)
- `cli/api/` — IC actor creation, network selection (ic/staging/local), package file downloads, version resolution

### Frontend
Svelte 5 + Vite 8, queries the main canister. Staging canister: `ogp6e-diaaa-aaaam-qajta-cai`.

## Key constraints

- **dfx version**: pinned in `dfx.json` via `dfxvm`. Do not run `dfxvm update/install/default` to change it.
- **Declarations must be regenerated** after backend changes: `npm run decl` (requires local dfx running).
- **API version** in `cli/mops.ts` (`apiVersion`) and `backend/main/main-canister.mo` (`API_VERSION`) must match.
