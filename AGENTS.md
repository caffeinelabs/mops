# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Contributing rules

- **Always create a PR.** Never push directly to `main`.
- **CLI design philosophy**: Follow conventions of established package managers (npm, cargo) — naming, flag style, UX patterns. Related commands must stay consistent: if `mops build` works without arguments (all canisters), then `mops check` and `mops check-stable` must too. When changing a command, review its siblings for consistency.
- **Keep docs in sync.** CLI command docs live in `docs/docs/cli/` and config reference in `docs/docs/09-mops.toml.md`. The same feature often appears in both — update all relevant pages.
- **Update the changelog.** Add entries under `## Next` in `cli/CHANGELOG.md` for any user-facing CLI changes.
- **Keep skills up to date.** When changing CLI commands or workflows, update `.agents/skills/mops-cli/SKILL.md` to match.
- **`base` is deprecated.** Use `core` for all new code, examples, and docs.
- **Pre-commit hook** runs `lint-staged + npm run check` via husky — fix TypeScript/lint errors before committing.
- **Snapshot testing strategy**: Use Jest snapshots (`cliSnapshot` / `toMatchSnapshot`) for the main use cases so the full CLI output is committed and reviewable. Corner-case and error-path tests should use targeted assertions (`toMatch`, `toBe`) without snapshots to avoid cluttering the snapshot file.

## Interactive commands (caution for agents)

Some `mops` commands prompt for input and hang in non-TTY environments (CI, agent loops). Always pass values up front:

| Interactive | Non-interactive form |
|---|---|
| `mops init` | `mops init --yes` |
| `mops bump` | `mops bump <major\|minor\|patch>` |
| `mops template` | `mops template <name>` (see `mops template --help` for names) |
| `mops toolchain use <tool>` | `mops toolchain use <tool> <version>` (e.g. `pocket-ic 12.0.0`). `latest` works but may resolve to a version incompatible with the shipped client. |
| `mops owner add\|rm <principal>` | `mops owner add\|rm <principal> --yes` |
| `mops maintainer add\|rm <principal>` | `mops maintainer add\|rm <principal> --yes` |
| `mops publish` (missing recommended `[package]` field, `CI` env unset) | Fill the field in `[package]`, or run with `CI=1` |

When adding a new command or option, prefer non-interactive (accept the value as an argument or flag). Reserve prompts for purely human-facing flows like `mops init`, and at any deprecation/missing-arg site recommend the non-interactive command verbatim (e.g. ``mops toolchain use pocket-ic 12.0.0``, not ``mops toolchain use pocket-ic``).

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
- Canister IDs are in `dfx.json`. Production main canister: `oknww-riaaa-aaaam-qaf6a-cai`.

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
