# Next-major checklist

Brief inventory of breaking changes and modernization work for the next major bump.
CLI (`ic-mops`) and the backend canister version independently — group accordingly.

Refs: GH = `caffeinelabs/mops`, LIN = Linear ticket title.

---

## Ship now — non-breaking items that don't need to wait for v3

These are mis-classified above as "v3" but are actually additive. Pull them out of the major and ship in 2.x:

### Pure additions (no behavior change for existing users)

**Trust / lockfile / registry**
- `mops ci` as a new subcommand with strict-lockfile semantics. Old `mops install` keeps working unchanged. The breaking part of GH #516 (dropping the `CI` env-var auto-detection) is what waits for v3.
- `mops verify` as an explicit on-disk integrity command. The breaking half (removing the implicit re-hash from `install`) waits for v3. (GH #517)
- Resolve dependency tree on the backend — new query method, doesn't replace anything. (GH #19)
- `yank` / `deprecate` / `unpublish` registry commands. (GH #291)
- Provide a downloadable package index (cargo/purescript style). Additive endpoint. (GH #291)

**Bundling / runtime**
- Bundle `ic.did` and auto-inject `--actor-id-alias aaaaa-aa`. Strictly fixes broken-today imports; nothing existing breaks. (GH #492)
- Standalone binary distribution alongside the npm package — additive third channel. (LIN: standalone binary)
- `MOPS_PASSWORD` env / `--password` flag for non-interactive identity (today `getIdentity()` blocks on stdin for encrypted PEMs — `cli/mops.ts:59`).

**Backend additions**
- Expose replica/PocketIC canister id to test harnesses — read-only addition. (GH #274)
- Backend file-blobs in stable memory — invisible to clients. (GH #18)
- Tarball storage on the backend — invisible if the existing per-file API stays for one cycle. (GH #291)
- `semver.mo`: pre-release tag support. (`utils/semver.mo:70`)
- `bench` internal canister → `core` (GH #354 partial).

### Schema-additive (old syntax still parses)
- Install-as alias: new `foo = { name = "core", … }` form, plain string still works. (GH #266)
- **Cargo-style version syntax** — phased to avoid breaking old CLIs (the backend's `Semver.validate` is strict `xx.xx.xx` today, and old CLIs would crash on `^1.2.3` in a fetched package's `mops.toml`):
  1. **2.x CLI-only**: parse `=`/`^`/`~`/`>=,<` and respect them **only in the consuming application's `mops.toml`** (root + local-path deps). `mops publish` rejects non-bare versions client-side, so the registry invariant is unchanged. Zero compat risk for old CLIs.
  2. **Coordinated CLI + backend release with `apiVersion` major bump**: backend `Semver.validate` accepts new syntax (`backend/main/utils/semver.mo:71`); `mops publish` allows it in `[dependencies]` of published packages. Old CLIs hit the existing major-mismatch path in `cli/mops.ts:289-315` and refuse with "upgrade required" instead of crashing.
  3. **v3 or later**: emit deprecation warning when a bare-version pin gets silently overridden by max-wins diamond resolution; eventually flip bare `1.2.3` to mean `^1.2.3` (see resolver section below).
- Multi-version: schema can land before moc `--override` does — resolver just rejects until support exists. (GH #283)
- Local-path transitives: today this errors; making it work is a strict relaxation. (GH #289)

### Deprecate-now-remove-in-v3 (stop adoption, keep working)
- Vessel / dhall: emit a one-time deprecation warning on `mops init` when `vessel.dhall` is present; remove code in v3. (GH #296)
- `dfx`-bundled moc fallback: warn on every fallback today; drop in v3.
- `// compatibility with older versions` re-exports in `cli/mops.ts`: mark `@deprecated` and document successors.
- `--legacy-persistence` default in `bench`: log a one-line deprecation when used.
- WASI `wasmtime` PATH fallback in `mops test` (already labeled "legacy" in `cli/commands/test/test.ts:264`): warn now, drop in v3.
- `GITHUB_ENV`-triggered concurrency change (`cli/commands/install/install-mops-dep.ts:84`) — replace with explicit `--concurrency` flag, deprecate the magic detection.
- `MOPS_*` env-var overrides (`MOPS_NETWORK`, `MOPS_REGISTRY_HOST`, `MOPS_REGISTRY_CANISTER_ID`, `MOPS_VERIFY_QUERY_SIGNATURES`, `MOPS_CWD`, `MOPS_ENV`): document them, log when active, and add proper flag equivalents. Today they silently change registry/network/cwd. (`cli/api/network.ts`, `cli/api/actors.ts`)

### Defaults that should be config-flag first
- Lintoko on `check`: already runs when pinned (2.6) — fine as-is. The "always-on" flip is what waits for v3.
- `mops watch --format`: gate behind `[watch] format = true` in 2.x; flip default in v3.
- Test reporter: `[test] reporter = "verbose"` opt-in now; flip default in v3.

### What actually has to wait for v3 (genuinely breaking)

**Adopt cargo's version model end-to-end** (close the gap between the update path and the resolve path)
- **Flip bare `1.2.3` to mean `^1.2.3`** in resolution + sources + install. Matches what `mops update`/`outdated` already do (`cli/commands/available-updates.ts:54` even has a `// Caret (cargo-style)` comment). Pre-requisites shipped in 2.x: the `=1.2.3` escape hatch and the deprecation warning on silent diamond overrides (see schema-additive section above).
- Resolver finds the *intersection* of all constraints and picks the highest satisfying version. Fail loudly on unsatisfiable constraints. No warning on within-major skew — that's the whole point of caret.
- Different-major diamonds → multi-version coexistence (gated on moc `--override`).
- Replace max-wins flattening + naive `parseInt` semver compare in `cli/resolve-packages.ts:43-119`. Use a proper semver comparator throughout the CLI (today line 43-64 does `parseInt` triples; backend `Semver` is more correct — they disagree on edges).
- `mops.lock` records the full resolved graph including git/path entries with content hashes (today `cli/integrity.ts` only hashes registry packages). Lock semantics stay exact-pin (cargo-style).
- **Migration risk**: users not committing lock (libraries) will start seeing within-major drift between machines. Bounded because (a) lock has been default since 2.8 and (b) the 2.x deprecation warning will have nagged anyone whose current pin was already being silently overridden.

**Hidden-state cleanup**
- Move `network.txt` out of the installed CLI directory (currently `new URL("./network.txt", import.meta.url)` in `cli/mops.ts:48`) into project-local + XDG global. Today `mops set-network local` in one project leaks into every project sharing the same `ic-mops` install.
- `mops toolchain init`: opt-in per shell instead of writing every detected init file plus `$GITHUB_ENV` (`cli/commands/toolchain/index.ts:98-164`).
- Stop invisible `installAll({ lock: "ignore" })` in `build`/`check`/`check-candid`/`check-stable`/`test`/`bench` (`cli/cli.ts:320-463`). These should respect the project's lock policy like `mops install` does.
- Align `--lock` flag values across all commands (today `install` accepts `check|update|ignore`, others accept only `update|ignore` — `cli/cli.ts:121-655`).
- Standardize exit codes: SIGINT exits with no code today (`cli/commands/install/install-mops-dep.ts:103`); replica bind failure exits `11` (`cli/commands/replica.ts:93`); rest of the codebase uses `1`.

**Drop / rename**
- `mops install` semantics change (drop CI env auto-detection, drop implicit `.mops/` re-hash).
- Removing `dfx` fallback paths entirely.
- Backend: drop legacy `PackageConfigV2` fields, legacy `owner`/`ownerInfo`, `packageOwners`, `hasDocumentation`. CLI + frontend + third-party clients all read these today.
- `apiVersion` major bump.
- Backend EOP migration (irreversible state-shape change).
- `PackagePublication.user` → `userId`.
- Strict unknown-flag handling.
- `mops watch` defaults: today no flags = "do almost everything" (`cli/commands/watch/watch.ts:32`). Make conservative; require explicit opt-in for `deploy`/`test`.

---

## CLI — breaking (v3.0.0)

### Trust & lockfile model (move closer to npm/cargo)
- Verify integrity at **download time**, stop re-hashing `.mops/` on every install; move on-disk verification behind `mops verify`. (GH #517)
- Add `mops ci` (or `--frozen` flag): fail loudly on missing/out-of-date lock; drop the `CI` env-var auto-detection in `mops install`. (GH #516)
- `mops install` becomes purely additive (`npm install` semantics) — no implicit "switch to check mode" behavior.
- `mops.lock` enabled by default (already done in 2.8); remove opt-in/legacy paths. (GH #288)

### Drop `dfx` coupling
- Remove `dfx`-bundled `moc` fallback in `toolchain bin --fallback`, `test`, `bench`, `bench-replica`, `docs`. (`cli/helpers/get-dfx-version.ts`, `cli/commands/toolchain/index.ts`)
- `mops init` stops fetching "default packages for dfx" — mops manages its own toolchain. (LIN: Doctor overhaul)
- Drop `mops toolchain init` requirement; the env-var setup becomes a hint when `dfx.json` is present. (LIN)
- Reject `dfx` field in `[package]` (already deprecated since 2.7).

#### Internal repo migration `dfx` → `icp` (our own tooling, not user-facing)
We can't credibly tell users to drop `dfx` while the repo's own dev/CI loop runs on it. Replace with `icp` cli:
- `package.json` scripts: `replica`, `decl:cli`, `deploy*` all shell out to `dfx start`/`dfx generate`/`dfx deploy`. Port to `icp` equivalents (or `icp-cli` recipes).
- Workflows: `.github/workflows/{ci,release,mops-test,setup-mops}.yml` use `dfinity/setup-dfx` + `dfx cache install`. Replace with the `icp` cli setup action.
- `dfx.json` → `icp` project config (decide whether to keep `dfx.json` for back-compat with external contributors).
- `cli/tests/build/no-dfx` and `build-no-dfx.test.ts` — keep as a regression test that mops works with neither `dfx` nor `icp` on PATH.
- `backend/DEVELOPMENT.md`, `cli/{DEVELOPMENT,README,RELEASE}.md`, `docs/docs/01-quick-start.md`, blog posts — rewrite examples in `icp` terms; keep a "migrating from dfx" note for users.
- AGENTS.md note "do not run `dfxvm update/install/default`" needs an `icp`-equivalent rule.

### Drop vessel / dhall
- Remove `cli/vessel.ts`, `readVesselConfig`, `installFromGithub` codepaths, vessel migration in `init`, `**/.vessel/**` ignores, `dhall-to-json-cli` dependency. (GH #296)

### Toolchain & runtime
- Drop Node.js < 20 (already needed). (GH #288)
- PocketIC v9 → v10. (GH #288)
- True Node-less binary distribution (single executable, no `node_modules`). Today both `npm i -g ic-mops` and the `cli-releases` canister `install.sh` end up shelling to `npm add -g <tgz>`, so any Node-runtime / native-module bug hits both. A binary built via Node SEA, `bun build --compile`, or a Rust rewrite (GH #237) would eliminate this whole class of install failures. (LIN: investigate publishing standalone binary)

### `mops.toml` schema
- Support **install-as alias** — table-stakes (cargo: `package = "..."`, npm: `"foo": "npm:bar@1"`). Mostly a `mops.toml` schema + `--package` plumbing change on our side. (GH #266)
- Support **multiple major versions** of the same package — also table-stakes for cargo/npm, but blocked on upstream moc `--override` (dfinity/motoko#5124). Plan the schema/resolver now, ship when moc lands the flag. (GH #283)
- Local-path deps no longer require copy-pasting transitives into the parent's `mops.toml`. (GH #289)
- Decide on `^`/range syntax (and document the difference from npm). (LIN: Mops support ^versions)

### Defaults & UX
- Revert default test reporter to `verbose` (or auto-pick by file count). (GH #288)
- Enable `--format` by default in `mops watch`. (GH #288)
- Run `lintoko` automatically when pinned (already partial in 2.6) — make it the default. (LIN: `lint` subcommand)
- Bundle `ic.did` and auto-inject `--actor-id-alias aaaaa-aa`. (GH #492, LIN: mops manages `ic.did`)
- Expose replica/PocketIC canister id to tests. (GH #274)
- Strict unknown-flag handling before `--` (remove `allowUnknownOption(true)` workaround in `cli/cli.ts:316`).

### Cleanup that affects users
- Remove `// compatibility with older versions` re-exports in `cli/mops.ts:324`.
- Drop legacy mocv detection in `cli/commands/docs.ts` and `toolchain/index.ts:133`.
- Bump `apiVersion` (CLI ↔ backend) once schema-affecting changes land.

---

## CLI — cleanup / modernization (non-breaking but bundled with major)

- Reduce bundle size: `glob` → `tinyglobby`, `tar` → `tar-fs + node:zlib`, `decomp-tarxz` → `xz-decompress`. (GH #296)
- Remove transitive deprecation warnings on `npm i -g ic-mops` (`@dfinity/*` → `@icp-sdk/core/*`, old `glob`, etc.). (LIN: remove deprecation warnings)
- Update `bench` internal canister to `core`. (GH #354, LIN)
- Update `[bench]`/`[test]` toolchain to drop `--legacy-persistence` default (`cli/commands/bench.ts:253`).
- HTTP layer: respect `HTTP_PROXY`/`HTTPS_PROXY`, raise TCP timeouts, fix Docker-on-mac hangs. (GH #228, #256, #304)

---

## Backend canister — breaking

### Persistence & runtime
- Migrate `backend/main/main-canister.mo` to `persistent actor` (EOP). Storage canister already is. Define migration for ~20 `stable var *Stable : [(K, V)]` arrays.
- Migrate `mo:base` → `mo:core` across all `backend/**/*.mo` (21 files). (GH #354)
- Store package file blobs in stable memory in storage canisters. (GH #18)

### Registry data model
- Drop legacy `PackageConfigV2` fields: `documentation`, `homepage`, `donation`, `scripts`, `dfx`, `moc`. (`backend/main/types.mo:62-80`)
- Drop legacy `PackageSummary.owner` / `ownerInfo` (use `owners[]`). (`types.mo:92`, `getPackageSummary.mo:46`)
- Drop legacy `packageOwners` map; keep only `ownersByPackage`. (`main-canister.mo:68`)
- Drop legacy `hasDocumentation` flag. (`types.mo:182`)
- Collapse `PackageConfigV2`/`V3`/`V3_Publishing` into a single current type.

### Resolution & storage
- Resolve dependency tree on the backend. (GH #19)
- Store packages as compressed tarballs with single integrity hash; cuts storage + per-install network round-trips. (GH #291, LIN: optimize package storage, try zipping each package)
- Provide an incremental package index (cargo/purescript style) for offline/`mops verify`. (GH #291)
- Reject Git/path deps in *published* packages (allow for dev-deps only). (GH #291)

### Lifecycle commands
- `yank` / `deprecate`. (GH #291)
- `unpublish` (with npm-style time/dependent restrictions). (GH #291)

### Misc
- Add canister upgrade test. (GH #169)
- `semver.mo`: support pre-release tags `1.2.3-pre.1`. (`utils/semver.mo:70`)
- `PackagePublication.user`: switch to `userId`. (`types.mo:47`)

---

## Open questions (decide before bumping)

- `mops promote` — vendor-into-source workflow. (GH #281)
- Publishing non-`.mo` files. (GH #217)
- Coverage reports. (GH #45)
- Custom registry endpoints — ship as supported feature or drop the env-var? (LIN, PR #425)
- Rust CLI rewrite — defer or commit. (GH #237)
- Workspaces (cargo `[workspace]` / npm workspaces). Shared lockfile root, member graph, single-resolve across in-repo packages. Significant design chunk; high payoff for monorepos.
- Lockfile commit guidance: today `cli/integrity.ts:199` tells library authors to gitignore `mops.lock`. Cargo and (increasingly) npm lean toward committing locks for libraries too (reproducible CI). Decide which side we're on, then make the tooling and docs consistent.
- Dev-dep / prod-dep separation in the resolved set: today `[dev-dependencies]` are merged into the same flat resolved set for the root project (`cli/resolve-packages.ts:86`, `cli/commands/sources.ts:21`). Cargo separates them. Worth doing if we go to a real resolver.

---

## P3 — nice-to-have, do when there's actual demand

Cargo/npm has these, mops doesn't, and that's been fine. Listed here so they're written down without committing to building them. Pull individual items up if a user actually asks.

**Cargo-style command parity**
- `mops tree` — show resolved graph + duplicates, like `cargo tree`.
- `mops why <pkg>` — inverse tree, "who pulled this in?". Pairs with `tree`.
- `mops doctor` — environment + cache + lockfile health in one command.
- `mops metadata` — JSON dump of resolved graph + manifest, like `cargo metadata`. Would unblock IDE integrations.
- `--json` output for `outdated`, `search`, `info` (today chalk-only).
- `mops add foo bar baz` — accept multiple packages in one invocation.
- `--dry-run` for `add`, `install`, `update`, `sync` (today only `remove` has it).
- `--manifest-path` / `-C <dir>` global flag for monorepo scripts.
- Global `-q/--quiet` consistency.
- `mops uninstall` as alias for `remove` (npm muscle memory).

**Publish ergonomics**
- `mops publish --dry-run` — rehearse upload, validate the packed tree without sending.
- `mops publish --allow-dirty` — match `cargo publish` semantics around VCS state.
- Pack preview on disk — write the tarball that *would* be uploaded so users can inspect it.
