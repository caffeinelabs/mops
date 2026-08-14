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

All three shipped in GH #679 (`fix(cli): use real semver in the resolver and always report cross-major conflicts`).

- ~~Replace the naive `parseInt` semver compare in `cli/resolve-packages.ts` with a proper semver comparator throughout~~ — **done on `v3`**.
- ~~**Cross-major conflicts warn loudly, always**~~ — **done on `v3`**: reported by default on every resolving command, on stderr so `mops sources` stays parseable. `mops sources --conflicts ignore` is the reviewed-and-accepted opt-out.
- ~~Document the official transitive-bump override~~ — **done on `v3`**: the conflict report itself names root pinning as the way to choose.

### Trust & lockfile model (move closer to npm/cargo)

- ~~Verify integrity at **download time**, stop re-hashing `.mops/` on every install; move on-disk verification behind `mops verify`~~ — **done on `v3`**. Files are hashed as they arrive and compared against the registry before the package is committed to the cache; `mops verify` is the on-demand on-disk audit. (GH #517)
- ~~Add `--locked`; drop the `CI` env-var auto-detection~~ — **done on `v3`** (GH #516). Available on `mops install` and every implicitly-resolving command; `mops sources` deliberately has none (dfx packtool parses its stdout mid-build). **Design correction:** `--locked` does *not* re-walk the dependency graph to byte-compare a freshly computed lock. It cannot: a lock-driven install skips the versions that lost a conflict, so their manifests are never cached and `resolvePackages({skipLock: true})` throws ENOENT on a fresh clone (reproduced). Instead it checks that the lock is present, parseable, current-format, pins every dependency declared in `mops.toml`, and agrees with the registry on every file hash. Same structural limitation the resolver-correctness work hit (GH #679); closing it needs a per-candidate manifest fetch, which is a new feature, not a lockfile change.
- ~~**Drop `--lock <check|update|ignore>` entirely**~~ — **done on `v3`**. `check` → `--locked`; `ignore` → no successor; `update` → plain `mops install`, now self-healing (also migrates locks carrying absolute local `path` entries, which previously required an explicit `--lock update`).
- ~~`mops install` becomes purely additive (`npm install` semantics) — no implicit "switch to check mode".~~ — **done on `v3`** with the `--locked` work (GH #516): the `CI` env auto-`check` path is gone; plain commands maintain the lock, `--locked` is the only check mode and always explicit.
- ~~`mops.lock` enabled by default (already done in 2.8); remove opt-in/legacy paths — and with `--lock ignore` gone, no opt-out at all.~~ — **done on `v3`**: the only lock modes left are `locked`/`maintain`/`skip` (`skip` is internal to `mops sources`); no user-facing opt-out exists. (GH #288)

### Hidden-state cleanup (silent-wrong-behavior — high priority)

- ~~Move `network.txt` out of the installed CLI directory into project-local + XDG global~~ — **superseded and done on `v3`**: the file and the `set-network`/`get-network` commands are **deleted** instead of relocated. `MOPS_NETWORK` (added in #437 precisely because writing inside the install dir fails in CI and Docker) is the only mechanism; it is what the docs recommend and what this repo's own dev loop and CI already use, and nothing in the repo called `set-network`. Relocating it would have meant maintaining durable config inside `.mops/`, which needed a special case to survive `mops cache clean`.
- ~~Stop invisible `installAll({ lock: "ignore" })` in `build`/`check`/`check-candid`/`check-stable`/`test`/`bench`~~ — **done on `v3`** (plus `generate candid`, a seventh site). They pass `defaultLock: "update"`, so they maintain the lock like `mops install` without tripping the deprecated `CI` auto-`check` path. `mops sources` intentionally keeps `lock: "ignore"` — its stdout is machine-parsed by the dfx packtool.
- ~~`mops toolchain init`: opt-in per shell instead of writing every detected init file plus `$GITHUB_ENV`~~ — **done on `v3`**: writes only the shell from `$SHELL`, `--shell <bash|zsh>` targets others, `$GITHUB_ENV` still written in GitHub Actions, and `toolchain reset` still cleans all known files.
- ~~Align `--lock` flag values across all commands~~ — superseded: `--lock` is dropped entirely (see Trust & lockfile model); remove the flag from `add`/`remove`/`install`/`sync`/`update` in `cli/cli.ts`.
- **Remove the `--lock` compatibility shim** (`cli/legacy-lock-flag.ts`, its five `addOption(legacyLockOption())` call sites and `cli/tests/legacy-lock-flag.test.ts`). Added so the 3.x rollout does not require migrating every v2 call site — pipelines, Dockerfiles and agent prompts that type `mops install --lock update` — at once. The flag is hidden and its value is ignored entirely, `check` included, so it is a pure parse-level accommodation and a clean revert once callers move to `--locked`.
- ~~Exit codes: the replica bind-failure exit `11` (`cli/commands/replica.ts:96`) remains to decide~~ — **done on `v3`**: normalized to `1`. Install SIGINT keeps the standard `130` (`cli/commands/install/install-mops-dep.ts:108-112`).

### dfx — full removal

~~Compromise (2026-07): keep `--replica dfx` as an explicit opt-in because our own dev loop still runs on dfx.~~ — **superseded**. PR #550 took dfx out of the local pipeline and `ci.yml`, which removed the only reason to keep the explicit path, so v3 removes dfx from the CLI outright rather than in a later major. The "dfx — full removal (later major)" item under Deferred is folded in here and done.

- ~~Remove `dfx`-bundled `moc` fallback in `toolchain bin --fallback`, `test`, `bench`, `bench-replica`, `docs`~~ — **done on `v3`**. `cli/helpers/get-moc-path.ts` and `cli/helpers/get-dfx-version.ts` are deleted; `toolchain.bin("moc")` errors naming `mops toolchain use moc <version>` when the pin is missing. `getMocVersion` is now the `[toolchain] moc` pin and nothing else.
- ~~Remove the **implicit** `dfx`/`dfx-pocket-ic` fallback when `[toolchain.pocket-ic]` is unset~~ — **done on `v3`**, and the explicit path went with it: `--replica` is gone from `mops test` and `mops bench`, `BenchReplica`/`Replica` are PocketIC-only, and `cli/helpers/deprecate-dfx-replica.ts` is deleted.
- ~~Flip the default so an unpinned `pocket-ic` auto-resolves to a mops-controlled `DEFAULT_POCKET_IC_VERSION`~~ — **reverted on `v3` before GA**. A silent default is a frozen contract (bumping 14 → 15 would change every unpinned project's replica) and the one exception to "toolchain versions are pinned". Replica tests, `mops bench`, `--check-deploy` and `mops toolchain bin pocket-ic` now error when unpinned, naming `mops toolchain use pocket-ic 15.0.0`. `RECOMMENDED_POCKET_IC_VERSION` in `cli/commands/toolchain/pocket-ic-versions.ts` is hint-only. **Offline-runtime guarantee (Caffeine requirement, 2026-07) still holds**: an explicit pin plus `toolchain.bin("pocket-ic")` going through the cached-check in `download()` is enough; warm the cache from the pin (e.g. `mops toolchain use pocket-ic 15.0.0` during a Docker image build).
- ~~**User-visible break**: implicit-dfx benchmark baselines drift~~ — **done on `v3`**: called out in `cli/CHANGELOG.md` and in the `mops bench` docs, recommending `--save`.
- ~~`mops init` stops fetching "default packages for dfx"~~ — **done on `v3`**. `mops init` no longer contacts the registry at all; a fresh `mops.toml` has no `[dependencies]`. (LIN: Doctor overhaul)
- ~~Drop `mops toolchain init` requirement; env-var setup becomes a hint when `dfx.json` is present. (LIN)~~ — **done on `v3`**, and taken further: the command is gone rather than reduced to a hint. `mops toolchain init` / `toolchain reset`, `cli/bin/moc-wrapper.sh` and the `moc-wrapper` bin entry are deleted, along with `checkToolchainInited()`. The bridge existed so a project that deploys with dfx still built with the pinned `moc`; icp-cli's Motoko recipe invokes `mops build`, so it inherits the pin with nothing in between.
- ~~Reject `dfx` field in `[package]` at publish~~ — **done on `v3`**: rejected with a dedicated error and dropped from `cli/types.ts`. Note the preflight list already rejected it as "not supported yet"; the change is the type removal and an accurate message. The backend `PackageConfigV3_Publishing.dfx` field is still sent as `""` for wire compatibility (dropping it needs the registry-data-model cleanup below).
- ~~Remove the remaining dfx-facing surface: `mops toolchain init` / `moc-wrapper`, `mops init` writing `defaults.build.packtool`, and `mops watch --deploy` / `--generate`~~ — **done on `v3`**. `mops watch` keeps errors, warnings, formatting and tests; the deploy and generate tasks shelled out to `dfx` and were dropped rather than ported (mops is not a deployment tool, and `dfx generate` emits JS/TS bindings, which mops has never produced — `mops generate candid` only writes `.did`). `cli/commands/watch/{deployer,generator,parseDfxJson}.ts` are deleted.

Only `mops sources` remains, and it is tool-agnostic: it prints `--package` flags and nothing else. A dfx user can still wire it up as a packtool, but the pinned `[toolchain] moc` no longer reaches `dfx build`.

### Drop vessel / dhall

- ~~Remove `readVesselConfig`, the vessel migration in `init` (deprecated with a warning since 2.14), `**/.vessel/**` ignores, and the `dhall-to-json-cli` dep~~ — **done on `v3`**; `cli/vessel.ts` is gone. Vessel-declared transitive deps of GitHub deps are no longer resolved either. (GH #296)
- ~~**Correction (2026-08-03): `installFromGithub` must MOVE, not be deleted.**~~ — **done on `v3`**: it now lives in `cli/commands/install/install-from-github.ts` (with its `downloadFromGithub` helper), unchanged apart from losing the vessel recursion. It serves ordinary `repo = "..."` GitHub deps, which the lockfile-v4 track plans to improve (SHA pinning).
- **Consequence for `decompress`: dropping vessel did *not* remove it.** `downloadFromGithub` still uses it for GitHub dep zips; the toolchain extractor moved off it in 2.20.0 (#667). That last call site must move to a safe extractor before the dep can go — see the security item in `TODO.md`, which is non-breaking and should ship in 2.x rather than wait for v3.

### Toolchain & runtime

- ~~Drop Node.js < 20 (`cli/package.json` engines currently `>=18.0.0`)~~ — **done on `v3`** (engines now `>=20.0.0`). (GH #288)
- ~~**Drop the legacy PocketIC client**~~ — **done on `v3`**. The `pic-ic` 0.5.4 dep, the `< 9.0.0` switch, the `AnyPocketIcServer`/`AnyPocketIc`/`AnySetupCanister` unions and the `addCycles` `number`/`bigint` wrapper are all gone; upstream `@dfinity/pic` is the only client. Subsumes the old "PocketIC v9 → v10" item (GH #288). Real blast radius was smaller than "everything below 9.0.0": `pic-ic@0.5.4` only speaks the 4.0.0 protocol, so 5.x–8.x pins already failed with `BinTimeoutError`.
  - **Design correction — the planned "supported server range" was not built, deliberately.** Only the floor exists (`MIN_POCKET_IC_VERSION` 9.0.0, in `cli/commands/toolchain/pocket-ic-versions.ts`), and it is framed as a *migration guard*, not a compatibility policy: `< 9.0.0` pins genuinely worked in 2.x via `pic-ic`, so without it an upgrade turns into an inscrutable `BinTimeoutError` instead of "run `mops toolchain use pocket-ic 15.0.0`". There is **no ceiling** and no clamping of `latest`. mops applies no version gating to `moc`, `wasmtime` or `lintoko` — the only version check in the CLI is `[requirements]`, which surfaces a *dependency-declared* minimum — so a mops-maintained list of blessed pocket-ic versions would be a new and inconsistent policy, and it would make our release cadence a gate on DFINITY's. A pin newer than anything we have tried is simply used; if the protocol has moved, the client's own error says so. The AGENTS.md `latest` caution stays accurate as a caution and needs no code behind it.
- ~~**Eliminate the `pic-js-mops` fork**~~ — **done, shipped in 2.x** (caffeinelabs/mops#642, merged 2026-08-03; closed GH #561). The fork had no public source repo; the two patches mops needed went upstream as dfinity/pic-js#276 (`binPath` + `POCKET_IC_BIN`) and #278 (`ttl`), released in `@dfinity/pic` 0.23.0. `pocket-ic` >= 9.0.0 now runs on upstream pic; `pic-ic` remains only for the deprecated `< 9.0.0` pins removed by the item above. `pic-js-mops` cannot be deprecated on npm — nobody has publish access (GH #657, closed).

Carried over from that work, all tracked as issues:

- **GH #651** — `@dfinity/pic` is a devDependency pre-bundled into `dist/vendor/pic.mjs`, because its `postinstall` downloads a ~94 MB pocket-ic binary and throws when it cannot (a plain `dependencies` entry makes `npm i -g ic-mops` fail with no network). If upstream makes that download lazy, the vendor entry, the `vendor:pic` step, the `fix-dist` rewrite and `cli/tests/vendor-pic.test.ts` all get deleted, and dev/CI installs stop paying the 94 MB.
- ~~**GH #652** — `@icp-sdk/core` 5.x~~ — **done on `v3`**, together with the dfx-replica removal as predicted. `cli` is on `5.4.0`, the same major `@dfinity/pic` 0.23.0 depends on, so `npm ls @icp-sdk/core` shows one deduped copy. `vendor:pic` now passes `--external:@icp-sdk/core --external:@icp-sdk/core/*`: `dist/vendor/pic.mjs` went from 1,172,937 to 614,603 bytes.
- **GH #655** — upstream stderr / `onCanisterLog` hook would delete the `serverProcess` cast in `cli/helpers/pocket-ic-client.ts`.

**Provenance, for the record**: `pic-js-mops` was published from a local checkout of `dfinity/pic-js` with four patches and no public repo — the only audit path was diffing the published tarball (done 2026-07: the diff was exactly those patches). `pic-ic`'s source is `github.com/ZenVoich/pic-js`, a personal repo whose history shows upstream once had `POCKET_IC_BIN`.

### Defaults & UX

Everything here except the canister-id item shipped in GH #676 (`feat(cli)!: stricter flags and safer defaults for v3`).

- ~~Run `lintoko` automatically when pinned — make it the default~~ — **done on `v3`**, with `mops check --no-lint` to opt out for a run.
- ~~Strict unknown-flag handling before `--`~~ — **done on `v3`**: unknown flags before `--` are an error on `build`, `check`, `check-stable`, `test`, `bench`, `generate candid` and `lint`; the `-- <tool flags>` passthrough is unaffected.
- Expose replica/PocketIC canister id to tests. (GH #274) Additive — don't gate the release on it. **Still open.**
- ~~Revert default test reporter to `verbose`~~ — **done on `v3`**: `verbose` for any number of files.
- ~~Enable `--format` by default in `mops watch`~~ — **done on `v3`**, as part of the new default set.
- ~~`mops watch` defaults: make conservative~~ — **done on `v3`**: no flags = error check, warning check, format. `--test` / `--generate` / `--deploy` are opt-in.
- ~~Flip `mops info <pkg> --versions` to newest-first~~ — **done on `v3`**.

### Cleanup that affects users

- ~~`mops install` semantics change (drop CI env auto-detection, drop implicit `.mops/` re-hash)~~ — **done on `v3`**.
- Bump `apiVersion` (CLI ↔ backend) only if schema-affecting changes land — nothing in this scope requires it.
- ~~Remove `// compatibility with older versions` re-exports (`cli/mops.ts:324-325`)~~ — **done on `v3`** (the one in-repo user, `cli/cache.ts`, now imports `getNetwork` from `cli/api/network.ts`).
- ~~Drop legacy mocv detection in `cli/commands/docs.ts:44-49` and `cli/commands/toolchain/index.ts:80-95,132-138`~~ — **done on `v3`**.

### Decide before release

- ~~Lockfile commit guidance~~ — **decided and done on `v3`**: everyone commits `mops.lock`, libraries included. A library's lock has no effect on consumers (they resolve their own graph) and it makes the library's own CI reproducible. The `mops.lock created.` message, `docs/docs/10-mops.lock.md` and the CLI skill all say so now.
- ~~Custom registry endpoints — ship as supported feature or drop the env-var?~~ — **decided: keep as supported.** `MOPS_REGISTRY_HOST` / `MOPS_REGISTRY_CANISTER_ID` are documented in the 3.x env-vars page, and the `@icp-sdk/core` 5.x entry in the changelog names their compatibility requirement (the replica must serve the HTTP API `v3` endpoint). (LIN, PR #425)
- **Docs audit of both trees before GA.** Walk every docs change on `main` and `v3` since the v3 branch (docs versioning in #687). `docs/docs/` is 3.x (`docs.mops.one/next/` until GA); `docs/versioned_docs/version-2.x/` is 2.x (site root). The trees have been mixed up (e.g. the first docs pass in #761); `main`'s AGENTS.md now says a 2.x change is documented in both, but historical pages still need a pass. 2.x pages must match shipped 2.x; 3.x pages must match v3. Merging `main` into `v3` is not a substitute: v3-specific wording (no dfx, required pocket-ic pin, lock model, …) must not be overwritten by 2.x copy. After GA the two trees swap (`docs/docs/` becomes the live 3.x site, 2.x stays the versioned snapshot).

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

Content: pin git deps to a **resolved commit SHA**. Today the `deps` map (`cli/integrity.ts:288-303`) stores the ref as written (`repo#v1.0.0`) — a moved tag goes unnoticed; only registry packages get file hashes (`cli/integrity.ts:69-86`). Resolve ref → SHA at lock (re)generation, verify at install. Path deps stay exempt by design (live-edited dirs; cargo precedent). A version bump (not in-place v3 extension) is required regardless: older CLIs fail v3's exact-match `deps` check and `hashes` count check on any added fields, and the unsupported-version error (`cli/integrity.ts:253`) is a cleaner, recoverable failure (`mops install --lock update` regenerates a v3 lock). Note: the github install path runs through `installFromGithub`, now in `cli/commands/install/install-from-github.ts` (it survived the v3 vessel deletion). Coordinate with the download-time-verification redesign (GH #517) if timelines overlap.

### Distribution (not semver-coupled — ship whenever ready)

- True Node-less binary distribution (single executable, no `node_modules`). Today `npm i -g ic-mops` and the `cli-releases` `install.sh` both end up shelling to `npm add -g <tgz>`, so any Node-runtime / native-module bug hits both. Node SEA, `bun build --compile`, or Rust rewrite (GH #237) eliminates this whole class of install failures. (LIN: investigate publishing standalone binary)
- Rust CLI rewrite — defer or commit. (GH #237)

### Internal repo migration `dfx` → `icp` (dev/CI loop, not user-facing — must land before the dfx-support removal ships)

v3 tells users mops does not support `dfx`, so this can no longer lag behind — our own release pipeline must be off dfx before that lands:

- ~~`package.json` `deploy*` scripts → `icp` equivalents.~~ Done.
- ~~`dfx.json` → `icp` project config.~~ Done — `dfx.json` is deleted, `icp.yaml` declares the `ic` and `staging` environments, and the mainnet/staging ID mappings are committed under `.icp/data/mappings/`.
- ~~`.github/workflows/release.yml`: replace `dfinity/setup-dfx` with the `icp` setup action.~~ Done — both canister deploys go through `.github/actions/deploy-canister`.
- ~~`.github/workflows/{mops-test,setup-mops}.yml` still install dfx.~~ Done — `mops.toml` pins `[toolchain] pocket-ic`, which 2.x honours over the dfx replica, and `setup-mops.yml` dropped its 2024-era `mops-version: 1.0.0` pin. 1.0.0 was the only version a pin could not rescue: it speaks only the PocketIC 4.0.0 API.
- `cli/tests/build/no-dfx/` + `build-no-dfx.test.ts` — keep as a regression test that mops works with neither `dfx` nor `icp` on PATH.
- ~~`cli/{DEVELOPMENT,RELEASE}.md` — rewrite in `icp` terms.~~ Done — `cli/DEVELOPMENT.md` is a real development doc (the release half was stale duplication of `RELEASE.md`, down to a dead `dfx deploy`), and `cli/RELEASE.md` deploys with the npm scripts and documents the preview-tag path. Remaining: a release blog post announcing v3 with a migrating-from-dfx note.

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
