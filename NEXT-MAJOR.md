# Next-major checklist

Breaking changes for v3. Non-breaking work that can ship now lives in `TODO.md`.

CLI (`ic-mops`) and the backend canister version independently — group accordingly.

Refs: GH = `caffeinelabs/mops`, LIN = Linear ticket title.

Structure: everything above the `## Deferred` separator is the **committed v3 scope** — shippable now, CLI-only, no prerequisite 2.x release and no backend changes on the critical path. Everything below is preserved for later majors/minors.

---

## v3 — committed scope

### Versioning decision (2026-07)

v3 **keeps today's version model**: bare `1.2.3` in `mops.toml` means exact, conflicts resolve max-wins ("root dep version or bigger"), freshness comes from caret-bounded `mops update` (`--patch`/`--major`, shipped 2.13/2.14). The cargo model (caret-by-default, `=` pins, constraint intersection, multi-version coexistence) moves to a future major — see Deferred.

Rationale: `=`/range syntax in *published* packages needs backend validator changes (`backend/main/utils/validateConfig.mo:248` runs `Semver.validate` on dep versions; `PackagePublisher.mo:106-118` requires the exact version to exist; alias prefix check at `validateConfig.mo:262`) plus an ecosystem forward-compat window, since older CLIs can't parse published spec strings. Caret-without-escape-hatch is a bad intermediate state. Motoko dep graphs are shallow today, so exact pins + one-command update is good enough — and the coherent time to adopt cargo's model is when moc `--override` lands, enabling the full jump at once.

### Resolver — keep semantics, fix correctness

- Replace the naive `parseInt` semver compare in `cli/resolve-packages.ts:43-119` with a proper semver comparator throughout. Same semantics, fewer wrong answers on edges — backend `Semver` and CLI `compareVersions` disagree today.
- **Cross-major conflicts warn loudly, always** (today the "Conflicting versions" warning at `cli/resolve-packages.ts:189-210` is gated behind the `conflicts` option). Silently handing a dep a different major is the resolver's instance of silent-wrong-behavior. Not an error — the user resolves it by pinning the version they want in their own `mops.toml` (max-wins makes root able to win).
- Document the official transitive-bump override: to pick up a transitive dep's bugfix release before the intermediate library republishes, pin the higher version at root.

### Trust & lockfile model (move closer to npm/cargo)

- Verify integrity at **download time**, stop re-hashing `.mops/` on every install; move on-disk verification behind `mops verify`. (GH #517)
- Add `--locked` (decision 2026-07: **no `mops ci` command** — npm's separate command is the ecosystem outlier; cargo `--locked`, pnpm `--frozen-lockfile`, yarn `--immutable` all use a flag). Semantics: fail loudly if `mops.lock` is missing or resolution would change it; never write the lock. Available on `mops install` **and** every implicitly-resolving command (`build`/`check`/`check-candid`/`check-stable`/`test`/`bench` — composes with the lock-policy fix in Hidden-state cleanup), since CI pipelines often run `mops test` directly without a prior install. Drop the `CI` env-var auto-detection in `mops install`. (GH #516). Deprecated with warnings since 2.18 via `cli/helpers/deprecate-ci-lock.ts`.
- **Drop `--lock <check|update|ignore>` entirely** (decision 2026-07). End state: two modes, no flag — plain commands are the dev flow, `--locked` is the CI flow. Per value: `check` → `--locked` (strictly stronger: also guarantees byte-stability); `ignore` → no opt-out, cargo model — the lock is always maintained (its only consumers were the internal `lock: "ignore"` calls removed in Hidden-state cleanup, and libraries, which gitignore it); `update` → plain `mops install` becomes **self-healing**: a corrupt, unparseable, or manifest-inconsistent lock is regenerated instead of erroring (npm/cargo behavior — a broken lock is only a dead end under `--locked`). Replace every "run `mops install --lock update`" recovery message (`cli/integrity.ts:157,258` and friends) with plain `mops install`. Cheap once verification moves to download time — lock validation is then parse + deps-hash compare, not a `.mops/` rehash.
- `mops install` becomes purely additive (`npm install` semantics) — no implicit "switch to check mode".
- `mops.lock` enabled by default (already done in 2.8); remove opt-in/legacy paths — and with `--lock ignore` gone, no opt-out at all (cargo model; ties into the commit-guidance question under Decide before release). (GH #288)

### Hidden-state cleanup (silent-wrong-behavior — high priority)

- Move `network.txt` out of the installed CLI directory (`new URL("./network.txt", import.meta.url)` in `cli/mops.ts:48`) into project-local + XDG global. Today `mops set-network local` in one project leaks into every project sharing the same `ic-mops` install.
- Stop invisible `installAll({ lock: "ignore" })` in `build`/`check`/`check-candid`/`check-stable`/`test`/`bench` (six sites in `cli/cli.ts`, ~365–612). Should respect the project's lock policy like `mops install` does.
- `mops toolchain init`: opt-in per shell instead of writing every detected init file plus `$GITHUB_ENV` (`cli/commands/toolchain/index.ts:98-164`).
- ~~Align `--lock` flag values across all commands~~ — superseded: `--lock` is dropped entirely (see Trust & lockfile model); remove the flag from `add`/`remove`/`install`/`sync`/`update` in `cli/cli.ts`.
- Exit codes: install SIGINT already exits `130` (standard — `cli/commands/install/install-mops-dep.ts:108-112`), so only the replica bind-failure exit `11` (`cli/commands/replica.ts:96`) remains to decide: keep as a documented distinct code or normalize to `1`.

### dfx — remove implicit rules, keep explicit opt-in

Compromise (2026-07): we have not migrated our own dev loop to `icp` yet, so v3 removes every *implicit* dfx dependency but keeps `--replica dfx` as an explicit, documented opt-in. Full removal happens in a later major once icp-cli is the norm.

- Remove `dfx`-bundled `moc` fallback in `toolchain bin --fallback`, `test`, `bench`, `bench-replica`, `docs`. (`cli/helpers/get-moc-path.ts:9`, `cli/helpers/get-dfx-version.ts`, `cli/commands/toolchain/index.ts:359,387`, `cli/commands/docs.ts:44-54`)
- Remove the **implicit** `dfx`/`dfx-pocket-ic` fallback when `[toolchain.pocket-ic]` is unset (`cli/commands/test/test.ts:66-82`, `cli/commands/bench.ts:88-99`). Keep explicit `--replica dfx` working. Deprecated with warnings since 2.14 via `cli/helpers/deprecate-dfx-replica.ts`.
- Flip the default so an unpinned `pocket-ic` auto-resolves to a mops-controlled `DEFAULT_POCKET_IC_VERSION` (download-on-demand via `toolchain.download("pocket-ic", ...)`) — **this constant does not exist yet**; required work before the default can flip. Document the version bump policy. **Offline-runtime guarantee (Caffeine requirement, 2026-07)**: the default must be a fixed constant baked into the CLI — never a runtime "latest" lookup — so a cache warmed at Docker-image build time (`mops toolchain use pocket-ic <ver>` or downloading the default) means runtime never touches the network; this must hold for every toolchain tool, not just pocket-ic.
- **User-visible break**: implicit-dfx benchmark baselines drift on first run because PocketIC and dfx-replica report different instruction/heap counts; call out in release notes and recommend re-recording with `--save`.
- `mops init` stops fetching "default packages for dfx" (`cli/commands/init.ts:255-257`) — mops manages its own toolchain. (LIN: Doctor overhaul)
- Drop `mops toolchain init` requirement; env-var setup becomes a hint when `dfx.json` is present. (LIN)
- Reject `dfx` field in `[package]` at publish (client-side; note: deprecation since 2.7 was docs-only — no runtime warning exists in the code today, `cli/types.ts:14`, `cli/commands/publish.ts:85,210`).

### Drop vessel / dhall

- Remove `readVesselConfig`, the vessel migration in `init` (deprecated with a warning since 2.14), `**/.vessel/**` ignores, and the `dhall-to-json-cli` dep. (GH #296)
- **Correction (2026-08-03): `installFromGithub` must MOVE, not be deleted.** It lives in `cli/vessel.ts:188` for historical reasons only — `cli/commands/install/install-dep.ts:23` and `cli/commands/add.ts:104` call it for ordinary `repo = "..."` GitHub deps, which mops supports and which the lockfile-v4 track plans to improve (SHA pinning). Deleting it would break git deps. Move it into `cli/commands/install/` and delete what's left of `vessel.ts`.
- **Consequence for `decompress`: dropping vessel does *not* remove it.** `installFromGithub` uses it, and so does the toolchain extractor (`cli/commands/toolchain/toolchain-utils.ts:64`, for moc/wasmtime/pocket-ic/lintoko archives). Both call sites must move to a safe extractor before the dep can go — see the security item in `TODO.md`, which is non-breaking and should ship in 2.x rather than wait for v3.

### Toolchain & runtime

- ~~Drop Node.js < 20 (`cli/package.json` engines currently `>=18.0.0`)~~ — **done on `v3`** (engines now `>=20.0.0`). (GH #288)
- **Drop the legacy PocketIC client** (decision 2026-07; **deprecated in 2.x, drop here** — decision 2026-08-03 to split rather than hold the whole switch for v3, matching the dfx-replica/vessel deprecate-then-drop pattern): delete the `pic-ic` 0.5.4 dep and the `< 9.0.0` switch in `cli/helpers/pocket-ic-client.ts`; upstream `@dfinity/pic` (switched to in 2.x, see below) becomes the only client, killing the `AnyPocketIcServer`/`AnyPocketIc`/`AnySetupCanister` union types that leak into `test`/`bench`/`replica`/`bench-replica`/`watch` signatures. Breaks only explicit `[toolchain] pocket-ic < 9.0.0` pins — error with the verbatim fix (`mops toolchain use pocket-ic 12.0.0`). Unpinned projects never hit it (they get `DEFAULT_POCKET_IC_VERSION`). Subsumes the old "PocketIC v9 → v10" item (GH #288): with one client, enforce a **supported server range** (floor 9.0.0, ceiling = shipped client's max) at `toolchain use` time — fixes the `latest`-resolves-to-incompatible-server footgun (see AGENTS.md caution); future ceiling raises are routine client updates, not majors. Keep the range as a maintained constant pair next to `DEFAULT_POCKET_IC_VERSION`.
- ~~**Eliminate the `pic-js-mops` fork**~~ — **done, shipped in 2.x** (caffeinelabs/mops#642, merged 2026-08-03; closed GH #561). The fork had no public source repo; the two patches mops needed went upstream as dfinity/pic-js#276 (`binPath` + `POCKET_IC_BIN`) and #278 (`ttl`), released in `@dfinity/pic` 0.23.0. `pocket-ic` >= 9.0.0 now runs on upstream pic; `pic-ic` remains only for the deprecated `< 9.0.0` pins removed by the item above. `pic-js-mops` cannot be deprecated on npm — nobody has publish access (GH #657, closed).

Carried over from that work, all tracked as issues:

- **GH #651** — `@dfinity/pic` is a devDependency pre-bundled into `dist/vendor/pic.mjs`, because its `postinstall` downloads a ~94 MB pocket-ic binary and throws when it cannot (a plain `dependencies` entry makes `npm i -g ic-mops` fail with no network). If upstream makes that download lazy, the vendor entry, the `vendor:pic` step, the `fix-dist` rewrite and `cli/tests/vendor-pic.test.ts` all get deleted, and dev/CI installs stop paying the 94 MB.
- **GH #652** — `@icp-sdk/core` 5.x, see the corrected note above: it belongs with the dfx-replica removal.
- **GH #655** — upstream stderr / `onCanisterLog` hook would delete the `serverProcess` cast in `cli/helpers/pocket-ic-client.ts`.

**Provenance, for the record**: `pic-js-mops` was published from a local checkout of `dfinity/pic-js` with four patches and no public repo — the only audit path was diffing the published tarball (done 2026-07: the diff was exactly those patches). `pic-ic`'s source is `github.com/ZenVoich/pic-js`, a personal repo whose history shows upstream once had `POCKET_IC_BIN`.

### Defaults & UX

- Run `lintoko` automatically when pinned (already partial in 2.6) — make it the default. (LIN: `lint` subcommand)
- Strict unknown-flag handling before `--` (remove `allowUnknownOption(true)` workarounds — now seven sites in `cli/cli.ts`: 361, 404, 451, 536, 605, 961, 1056).
- Expose replica/PocketIC canister id to tests. (GH #274) Additive — don't gate the release on it.
- Revert default test reporter to `verbose` (or auto-pick by file count). (GH #288)
- Enable `--format` by default in `mops watch`. (GH #288)
- `mops watch` defaults: today no flags = "do almost everything" (`cli/commands/watch/watch.ts:32-42`). Make conservative; require explicit opt-in for `deploy`/`test`.
- Flip `mops info <pkg> --versions` to newest-first (`cli/commands/info.ts:37-39` already carries the v3 comment); `mops toolchain info --versions` established newest-first as the standard.

### Cleanup that affects users

- `mops install` semantics change (drop CI env auto-detection, drop implicit `.mops/` re-hash).
- Bump `apiVersion` (CLI ↔ backend) only if schema-affecting changes land — nothing in this scope requires it.
- ~~Remove `// compatibility with older versions` re-exports (`cli/mops.ts:324-325`)~~ — **done on `v3`** (the one in-repo user, `cli/cache.ts`, now imports `getNetwork` from `cli/api/network.ts`).
- ~~Drop legacy mocv detection in `cli/commands/docs.ts:44-49` and `cli/commands/toolchain/index.ts:80-95,132-138`~~ — **done on `v3`**.

### Decide before release

- Lockfile commit guidance: `cli/integrity.ts:223` tells library authors to gitignore `mops.lock`. Cargo and (increasingly) npm lean toward committing locks for libraries too. Pick a side before v3 docs are written, then make tooling and docs consistent.
- Custom registry endpoints — ship as supported feature or drop the env-var? Removal is only free in a major. (LIN, PR #425)

---

## Deferred — later majors / independent tracks

### Cargo version model (future major, gated on moc `--override` — dfinity/motoko#5124)

Adopt cargo's model end-to-end as one coherent jump once moc supports multiple versions of a package in a build:

- **Flip bare `1.2.3` to mean `^1.2.3`** in resolution + sources + install. `mops update`/`outdated` already do this (`cli/commands/available-updates.ts:53-56` has the `// Caret (cargo-style)` comment). Purely client-side reinterpretation of existing registry data — no backend migration.
- Resolver finds the *intersection* of all constraints, picks the highest satisfying version. Fail loudly on unsatisfiable. No warning on within-major skew — that's the point of caret.
- `=1.2.3` escape hatch. Backend work: dep-version validation must accept spec strings (`validateConfig.mo:248`), the dep-exists check becomes "some version satisfies the spec" (`PackagePublisher.mo:106-118`), alias prefix check fix (`validateConfig.mo:262`), display paths like `getPackageSummary.mo:105`. Non-breaking canister upgrade (accepts a superset), deployable ahead of time. Ecosystem forward-compat window needed: older CLIs can't parse published `=` strings — tolerate-parse (strip) `=` in 3.x CLIs early to shorten the window.
- Different-major diamonds → multi-version coexistence via moc `--override`. (GH #283)
- Decide on `^`/range syntax (and document the difference from npm). (LIN: Mops support ^versions)
- Dev-dep / prod-dep separation: today root `[dev-dependencies]` merge into the same flat resolved set (`cli/resolve-packages.ts:86-91`). Cargo separates them. Do alongside this resolver rewrite.
- Workspaces (cargo `[workspace]` / npm workspaces). Shared lockfile root, member graph, single-resolve across in-repo packages. Significant design chunk; high payoff for monorepos.
- **Migration risk**: library authors not committing lock will see within-major drift. Bounded because lock is default since 2.8; v3's cross-major warning will have flagged conflicted graphs long before.

### Additive features (can ship in a 3.x minor)

- **Install-as alias** — table-stakes (cargo `package = "..."`, npm `"foo": "npm:bar@1"`). Schema + `--package` plumbing change. (GH #266)
- Local-path deps no longer require copy-pasting transitives into the parent's `mops.toml`. (GH #289)

### Lockfile v4 (own versioning track, cargo-style rollout — not coupled to any CLI major)

Lock format versions independently of the CLI (cargo precedent: cargo is perpetually 1.x, yet shipped lock v1→v4 via read-early/write-later). Ship in two non-breaking-at-the-time phases whenever the work starts:

1. **Read support** in any regular release — extend `supportedVersions` (`cli/integrity.ts:232`), parse/verify the new fields, write nothing.
2. **Flip the write default** in a later release, once the installed base has absorbed read support.

Content: pin git deps to a **resolved commit SHA**. Today the `deps` map (`cli/integrity.ts:288-303`) stores the ref as written (`repo#v1.0.0`) — a moved tag goes unnoticed; only registry packages get file hashes (`cli/integrity.ts:69-86`). Resolve ref → SHA at lock (re)generation, verify at install. Path deps stay exempt by design (live-edited dirs; cargo precedent). A version bump (not in-place v3 extension) is required regardless: older CLIs fail v3's exact-match `deps` check and `hashes` count check on any added fields, and the unsupported-version error (`cli/integrity.ts:253`) is a cleaner, recoverable failure (`mops install --lock update` regenerates a v3 lock). Note: the github install path runs through `installFromGithub` in `cli/vessel.ts` — must survive the v3 vessel deletion. Coordinate with the download-time-verification redesign (GH #517) if timelines overlap.

### Distribution (not semver-coupled — ship whenever ready)

- True Node-less binary distribution (single executable, no `node_modules`). Today `npm i -g ic-mops` and the `cli-releases` `install.sh` both end up shelling to `npm add -g <tgz>`, so any Node-runtime / native-module bug hits both. Node SEA, `bun build --compile`, or Rust rewrite (GH #237) eliminates this whole class of install failures. (LIN: investigate publishing standalone binary)
- Rust CLI rewrite — defer or commit. (GH #237)

### dfx — full removal (later major)

- Delete the explicit `--replica dfx` path kept in v3, plus `dfx-pocket-ic`.
- Reject `dfx.json`-adjacent hints entirely.

### Internal repo migration `dfx` → `icp` (dev/CI loop, not user-facing — non-blocking for v3)

We can't credibly tell users to drop `dfx` while our own dev loop runs on it, but v3 keeps explicit dfx support anyway, so this proceeds in parallel:

- `package.json` scripts (`replica`, `decl:cli`, `deploy*`) → `icp` equivalents.
- `.github/workflows/{ci,release,mops-test,setup-mops}.yml`: replace `dfinity/setup-dfx` + `dfx cache install` with the `icp` setup action.
- `dfx.json` → `icp` project config (decide whether to keep `dfx.json` for back-compat).
- `cli/tests/build/no-dfx/` + `build-no-dfx.test.ts` — keep as a regression test that mops works with neither `dfx` nor `icp` on PATH.
- `backend/DEVELOPMENT.md`, `cli/{DEVELOPMENT,README,RELEASE}.md`, `docs/docs/01-quick-start.md`, blog posts — rewrite in `icp` terms; add a "migrating from dfx" note.
- `AGENTS.md` rule "do not run `dfxvm update/install/default`" needs an `icp`-equivalent.

---

## Backend canister — breaking (versions independently; nothing here gates CLI v3)

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

- `yank` / `deprecate` / `unpublish` (with npm-style time/dependent restrictions). (GH #291) Priority raised by the no-`=` decision — yank is the systemic answer to "patch release X is broken" without exact pins.

### Misc

- Add canister upgrade test. (GH #169)
- `semver.mo`: support pre-release tags `1.2.3-pre.1` (`backend/main/utils/semver.mo:70`) — bundle with the spec-validator work from the deferred cargo-model track so `semver.mo` is touched once.
- `PackagePublication.user` → `userId`. (`backend/main/types.mo:47`)

---

## Open questions (remaining)

- `mops promote` — vendor-into-source workflow. (GH #281)
- Publishing non-`.mo` files. (GH #217)
- Coverage reports. (GH #45)
