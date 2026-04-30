# Next-major checklist

Breaking changes and modernization for the next major bump. CLI (`ic-mops`) and the backend canister version independently — group accordingly.

Refs: GH = `caffeinelabs/mops`, LIN = Linear ticket title.

---

## Ship now — non-breaking, don't wait for v3

### Pure additions

**Trust / lockfile / registry**
- `mops verify` as an explicit on-disk integrity command. The breaking half (removing the implicit re-hash from `install`) waits for v3. (GH #517)
- `mops ci` (or `--frozen`) with strict-lockfile semantics. Old `mops install` unchanged. The breaking half (dropping `CI` env-var auto-detection in `cli/integrity.ts:40`) waits for v3. (GH #516)
- Resolve dependency tree on the backend — additive query method. (GH #19)
- `yank` / `deprecate` / `unpublish`. (GH #291)
- Downloadable package index (cargo/purescript style), additive endpoint. (GH #291)

**Bundling / runtime**
- `MOPS_PASSWORD` / `--password` for non-interactive identity (today `getIdentity()` blocks on stdin for encrypted PEMs — `cli/mops.ts:59-82`).
- Standalone binary distribution alongside npm — additive third channel. (LIN: standalone binary)

**Backend additions**
- File blobs in stable memory (storage canisters). Invisible to clients. (GH #18)
- Tarball storage. Invisible if per-file API stays for one cycle. (GH #291)
- Expose replica/PocketIC canister id to test harnesses. (GH #274)
- `bench` internal canister → `core`. (GH #354 partial)
- `semver.mo`: pre-release tag support. (`backend/main/utils/semver.mo:70`)

### Schema-additive (old syntax still parses)

- **Cargo-style version syntax** — phased to avoid breaking old CLIs (`Semver.validate` is strict `xx.xx.xx` today — old CLIs would crash on `^1.2.3` in a fetched `mops.toml`):
  1. **2.x CLI-only**: parse `=`/`^`/`~`/`>=,<` and respect them **only in the consuming app's `mops.toml`** (root + local-path deps). `mops publish` keeps rejecting non-bare versions client-side. Zero risk for old CLIs.
  2. **Coordinated CLI + backend with `apiVersion` major bump**: backend `Semver.validate` accepts new syntax (`backend/main/utils/semver.mo:71`); `mops publish` allows it in published `[dependencies]`. Old CLIs hit the existing major-mismatch path (`cli/mops.ts:289-300`) and refuse with "upgrade required" instead of crashing.
  3. **v3+**: deprecation warning when a bare pin is silently overridden by max-wins; flip bare `1.2.3` to mean `^1.2.3`.
- Install-as alias: new `foo = { name = "core", … }` form, plain string still works. (GH #266)
- Packages can declare exported `.did` files in `mops.toml`; CLI auto-injects matching `--actor-id-alias` moc flags (mirrors how lintoko rules are exported). Ship a separate `ic-did` package for the management canister, auto-published with major bumps on Motoko-incompatible changes. Replaces the broken-today manual download/commit workflow. (LANG-1280, GH #492)
- Multi-version: schema can land before moc `--override`; resolver rejects until then. (GH #283)
- Local-path transitives: relax remaining edge-cases (today `installLocalDep` recurses but resolver edges still misbehave). (GH #289)

### Deprecate-now-remove-in-v3

- `MOPS_*` env-var overrides (`MOPS_NETWORK`, `MOPS_REGISTRY_HOST`, `MOPS_REGISTRY_CANISTER_ID`, `MOPS_VERIFY_QUERY_SIGNATURES`, `MOPS_CWD`, `MOPS_ENV`): document, log when active, add proper flag equivalents. Today they silently change registry/network/cwd. (`cli/api/network.ts`, `cli/api/actors.ts`, `cli/cli.ts:72`)
- `GITHUB_ENV`-triggered concurrency change (`cli/commands/install/install-mops-dep.ts:85`) — replace with explicit `--concurrency` flag.
- Vessel / dhall: emit one-time warning on `mops init` when `vessel.dhall` is present (`cli/commands/init.ts:39-55`); remove in v3. (GH #296)
- `dfx`-bundled moc fallback: warn on every fallback today (`cli/commands/toolchain/index.ts:359,387`, `cli/commands/docs.ts:44-54`); drop in v3.
- WASI `wasmtime` PATH fallback already labelled "legacy" — already warns (`cli/commands/test/test.ts:270-280`); remove in v3.
- `// compatibility with older versions` re-exports (`cli/mops.ts:324-325`): mark `@deprecated`, document successors.
- `--legacy-persistence` default in `bench` (`cli/commands/bench.ts:253`): one-line deprecation when used.

### Defaults that should be config-flag first
- `mops watch --format`: gate behind `[watch] format = true` in 2.x; flip default in v3.
- Test reporter: `[test] reporter = "verbose"` opt-in; flip default in v3.
- Lintoko on `check`: already runs when pinned (2.6) — fine. The "always-on" flip waits for v3.

### What actually waits for v3 (genuinely breaking)

**Adopt cargo's version model end-to-end** (close the gap between update path and resolve path)
- **Flip bare `1.2.3` to mean `^1.2.3`** in resolution + sources + install. `mops update`/`outdated` already do this (`cli/commands/available-updates.ts:53-56` has the `// Caret (cargo-style)` comment). Pre-requisites in 2.x: `=1.2.3` escape hatch + diamond-override deprecation.
- Resolver finds the *intersection* of all constraints, picks the highest satisfying version. Fail loudly on unsatisfiable. No warning on within-major skew — that's the point of caret.
- Different-major diamonds → multi-version coexistence (gated on moc `--override`).
- Replace max-wins flattening + naive `parseInt` semver compare in `cli/resolve-packages.ts:43-119`. Use a proper semver comparator throughout. Backend `Semver` and CLI `compareVersions` disagree on edges today.
- `mops.lock` records git/path entries with content hashes (today only registry packages get hashed in `cli/integrity.ts`; v3 lock has resolved versions but no hashes for git/path). Lock semantics stay exact-pin.
- **Migration risk**: library authors not committing lock will see within-major drift. Bounded because (a) lock is default since 2.8 and (b) the 2.x deprecation will have nagged anyone whose pin was already silently overridden.

**Hidden-state cleanup** (all silent-wrong-behavior — high priority)
- Move `network.txt` out of the installed CLI directory (`new URL("./network.txt", import.meta.url)` in `cli/mops.ts:48`) into project-local + XDG global. Today `mops set-network local` in one project leaks into every project sharing the same `ic-mops` install.
- Stop invisible `installAll({ lock: "ignore" })` in `build`/`check`/`check-candid`/`check-stable`/`test`/`bench` (`cli/cli.ts:320-463`). Should respect the project's lock policy like `mops install` does.
- `mops toolchain init`: opt-in per shell instead of writing every detected init file plus `$GITHUB_ENV` (`cli/commands/toolchain/index.ts:98-164`).
- Align `--lock` flag values across all commands — `install` accepts `check|update|ignore`, others only `update|ignore` (across `add`/`remove`/`install`/`sync`/`update` in `cli/cli.ts`).
- Standardize exit codes: SIGINT exits with no code (`cli/commands/install/install-mops-dep.ts:103-106`); replica bind failure exits `11` (`cli/commands/replica.ts:96`); rest of codebase uses `1`.

**Drop / rename**
- `mops install` semantics change (drop CI env auto-detection, drop implicit `.mops/` re-hash).
- Remove `dfx` fallback paths entirely.
- Backend: drop legacy `PackageConfigV2` fields, legacy `owner`/`ownerInfo`, `packageOwners`, `hasDocumentation`. CLI + frontend + third-party clients all read these today.
- `apiVersion` major bump.
- Backend EOP migration (irreversible state-shape change).
- `PackagePublication.user` → `userId` (`backend/main/types.mo:47`).
- Strict unknown-flag handling (`cli/cli.ts:316,345,381,813`).
- `mops watch` defaults: today no flags = "do almost everything" (`cli/commands/watch/watch.ts:32-42`). Make conservative; require explicit opt-in for `deploy`/`test`.

---

## CLI — breaking (v3.0.0)

### Trust & lockfile model (move closer to npm/cargo)
- Verify integrity at **download time**, stop re-hashing `.mops/` on every install; move on-disk verification behind `mops verify`. (GH #517)
- Add `mops ci` (or `--frozen`): fail loudly on missing/out-of-date lock; drop the `CI` env-var auto-detection in `mops install`. (GH #516)
- `mops install` becomes purely additive (`npm install` semantics) — no implicit "switch to check mode".
- `mops.lock` enabled by default (already done in 2.8); remove opt-in/legacy paths. (GH #288)

### Drop `dfx` coupling
- Remove `dfx`-bundled `moc` fallback in `toolchain bin --fallback`, `test`, `bench`, `bench-replica`, `docs`. (`cli/helpers/get-dfx-version.ts`, `cli/commands/toolchain/index.ts:359,387`, `cli/commands/docs.ts:44-54`)
- `mops init` stops fetching "default packages for dfx" — mops manages its own toolchain. (LIN: Doctor overhaul)
- Drop `mops toolchain init` requirement; env-var setup becomes a hint when `dfx.json` is present. (LIN)
- Reject `dfx` field in `[package]` (deprecated since 2.7).

#### Internal repo migration `dfx` → `icp` (dev/CI loop, not user-facing)
We can't credibly tell users to drop `dfx` while our own dev loop runs on it.
- `package.json` scripts (`replica`, `decl:cli`, `deploy*`) → `icp` equivalents.
- `.github/workflows/{ci,release,mops-test,setup-mops}.yml`: replace `dfinity/setup-dfx` + `dfx cache install` with the `icp` setup action.
- `dfx.json` → `icp` project config (decide whether to keep `dfx.json` for back-compat).
- `cli/tests/build/no-dfx/` + `build-no-dfx.test.ts` — keep as a regression test that mops works with neither `dfx` nor `icp` on PATH.
- `backend/DEVELOPMENT.md`, `cli/{DEVELOPMENT,README,RELEASE}.md`, `docs/docs/01-quick-start.md`, blog posts — rewrite in `icp` terms; add a "migrating from dfx" note.
- `AGENTS.md` rule "do not run `dfxvm update/install/default`" needs an `icp`-equivalent.

### Drop vessel / dhall
- Remove `cli/vessel.ts`, `readVesselConfig`, `installFromGithub`, vessel migration in `init`, `**/.vessel/**` ignores, `dhall-to-json-cli` dep. (GH #296)

### Toolchain & runtime
- True Node-less binary distribution (single executable, no `node_modules`). Today `npm i -g ic-mops` and the `cli-releases` `install.sh` both end up shelling to `npm add -g <tgz>`, so any Node-runtime / native-module bug hits both. Node SEA, `bun build --compile`, or Rust rewrite (GH #237) eliminates this whole class of install failures. (LIN: investigate publishing standalone binary)
- Drop Node.js < 20. (GH #288)
- PocketIC v9 → v10. (GH #288)

### `mops.toml` schema
- **Install-as alias** — table-stakes (cargo `package = "..."`, npm `"foo": "npm:bar@1"`). Schema + `--package` plumbing change. (GH #266)
- Decide on `^`/range syntax (and document the difference from npm). (LIN: Mops support ^versions)
- **Multiple major versions** of the same package — table-stakes for cargo/npm, blocked on upstream moc `--override` (dfinity/motoko#5124). Plan now, ship when moc lands the flag. (GH #283)
- Local-path deps no longer require copy-pasting transitives into the parent's `mops.toml`. (GH #289)

### Defaults & UX
- Run `lintoko` automatically when pinned (already partial in 2.6) — make it the default. (LIN: `lint` subcommand)
- Strict unknown-flag handling before `--` (remove `allowUnknownOption(true)` workarounds in `cli/cli.ts:316,345,381,813`).
- Expose replica/PocketIC canister id to tests. (GH #274)
- Revert default test reporter to `verbose` (or auto-pick by file count). (GH #288)
- Enable `--format` by default in `mops watch`. (GH #288)

### Cleanup that affects users
- Bump `apiVersion` (CLI ↔ backend) once schema-affecting changes land.
- Remove `// compatibility with older versions` re-exports (`cli/mops.ts:324-325`).
- Drop legacy mocv detection in `cli/commands/docs.ts:44-49` and `cli/commands/toolchain/index.ts:80-95,132-138`.

---

## CLI — cleanup / modernization (non-breaking but bundled with major)

- HTTP layer: respect `HTTP_PROXY`/`HTTPS_PROXY`, raise TCP timeouts, fix Docker-on-mac hangs. (GH #228, #256, #304)
- Reduce bundle size: `glob` → `tinyglobby`, `tar` → `tar-fs + node:zlib`, `decomp-tarxz` → `xz-decompress`. (GH #296)
- Remove transitive deprecation warnings on `npm i -g ic-mops` (`@dfinity/*` → `@icp-sdk/core/*`, old `glob`, etc.). (LIN: remove deprecation warnings)
- Update `bench` internal canister to `core`. (GH #354, LIN)
- Drop `--legacy-persistence` default in `bench` (`cli/commands/bench.ts:253`).

---

## Backend canister — breaking

### Persistence & runtime
- Migrate `backend/main/main-canister.mo` to `persistent actor` (EOP). Storage canister already is. Define migration for ~20 `stable var *Stable : [(K, V)]` arrays.
- Migrate `mo:base` → `mo:core` across all `backend/**/*.mo` (21 files). (GH #354)
- Store package file blobs in stable memory in storage canisters. (GH #18)

### Registry data model
- Drop legacy `PackageConfigV2` fields: `documentation`, `homepage`, `donation`, `scripts`, `dfx`, `moc`. (`backend/main/types.mo:73-80`)
- Drop legacy `PackageSummary.owner` / `ownerInfo` (use `owners[]`). (`types.mo:92-93`, `getPackageSummary.mo:46-47`)
- Drop legacy `packageOwners` map; keep only `ownersByPackage`. (`main-canister.mo:68`)
- Drop legacy `hasDocumentation` flag. (`types.mo:182`)
- Collapse `PackageConfigV2`/`V3`/`V3_Publishing` into a single current type. (`types.mo:62-89`)

### Resolution & storage
- Resolve dependency tree on the backend. (GH #19)
- Store packages as compressed tarballs with single integrity hash; cuts storage + per-install round-trips. (GH #291, LIN: optimize package storage)
- Provide an incremental package index for offline/`mops verify`. (GH #291)
- Reject Git/path deps in *published* packages (allow for dev-deps only). (GH #291)

### Lifecycle commands
- `yank` / `deprecate` / `unpublish` (with npm-style time/dependent restrictions). (GH #291)

### Misc
- Add canister upgrade test. (GH #169)
- `semver.mo`: support pre-release tags `1.2.3-pre.1`. (`backend/main/utils/semver.mo:70`)
- `PackagePublication.user` → `userId`. (`backend/main/types.mo:47`)

---

## Open questions (decide before bumping)

- Lockfile commit guidance: `cli/integrity.ts:200-202` tells library authors to gitignore `mops.lock`. Cargo and (increasingly) npm lean toward committing locks for libraries too. Pick a side, then make tooling and docs consistent.
- Workspaces (cargo `[workspace]` / npm workspaces). Shared lockfile root, member graph, single-resolve across in-repo packages. Significant design chunk; high payoff for monorepos.
- Dev-dep / prod-dep separation: today root `[dev-dependencies]` are merged into the same flat resolved set (`cli/resolve-packages.ts:86-91`). Cargo separates them. Worth doing alongside the resolver rewrite.
- Custom registry endpoints — ship as supported feature or drop the env-var? (LIN, PR #425)
- Rust CLI rewrite — defer or commit. (GH #237)
- `mops promote` — vendor-into-source workflow. (GH #281)
- Publishing non-`.mo` files. (GH #217)
- Coverage reports. (GH #45)

---

## P3 — nice-to-have, do when there's actual demand

Cargo/npm has these, mops doesn't, and that's been fine. Pull individual items up if a user asks.

**Cargo-style command parity**
- `mops tree` — resolved graph + duplicates.
- `mops why <pkg>` — inverse tree, "who pulled this in?".
- `mops doctor` — environment + cache + lockfile health.
- `mops metadata` — JSON dump of resolved graph + manifest (unblocks IDE integrations).
- `--json` output for `outdated`, `search`, `info`.
- `mops add foo bar baz` — accept multiple packages.
- `--dry-run` for `add`, `install`, `update`, `sync` (today only `remove` has it).
- `--manifest-path` / `-C <dir>` global flag.
- Global `-q/--quiet` consistency.
- `mops uninstall` as alias for `remove`.

**Publish ergonomics**
- `mops publish --dry-run` — rehearse upload, validate the packed tree.
- `mops publish --allow-dirty` — match `cargo publish` semantics around VCS state.
- Pack preview on disk — write the tarball that *would* be uploaded.
