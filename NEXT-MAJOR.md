# Next-major checklist

Breaking changes deferred past 3.0.0, now that it has shipped. Non-breaking work that can ship in a 3.x minor lives here or in `TODO.md`.

CLI (`ic-mops`) and the backend canister version independently — group accordingly.

Refs: GH = `caffeinelabs/mops`, LIN = Linear ticket title.

This file is forward-looking only. Shipped breaking changes are recorded in `cli/CHANGELOG.md`, not here.

---

## Standing decisions

Recorded so they are not re-litigated. Each was considered and deliberately not built.

- **v3 keeps today's version model.** Bare `1.2.3` in `mops.toml` means exact, conflicts resolve max-wins, freshness comes from caret-bounded `mops update`. `=`/range syntax in _published_ packages needs backend validator changes plus an ecosystem forward-compat window (older CLIs cannot parse published spec strings), and caret-without-escape-hatch is a bad intermediate state. Motoko dep graphs are shallow, so exact pins plus one-command update is good enough — and the coherent time to adopt cargo's model is when moc `--override` lands, enabling the full jump at once. See **Cargo version model** below.
- **No supported-range policy for PocketIC.** Only a floor exists (`MIN_POCKET_IC_VERSION` 9.0.0 in `cli/commands/toolchain/pocket-ic-versions.ts`), framed as a _migration guard_, not a compatibility policy: `< 9.0.0` pins genuinely worked in 2.x via `pic-ic`, so without it an upgrade turns into an inscrutable `BinTimeoutError`. There is **no ceiling** and no clamping of `latest`. mops applies no version gating to `moc`, `wasmtime` or `lintoko` — the only version check in the CLI is `[requirements]`, which surfaces a _dependency-declared_ minimum — so a mops-maintained list of blessed pocket-ic versions would be a new and inconsistent policy, and would make our release cadence a gate on DFINITY's. A pin newer than anything we have tried is simply used; if the protocol has moved, the client's own error says so.
- **No silent default for `[toolchain] pocket-ic`.** A silent default is a frozen contract (bumping 14 → 15 would change every unpinned project's replica) and the one exception to "toolchain versions are pinned". `RECOMMENDED_POCKET_IC_VERSION` is hint-only. The offline-runtime guarantee (Caffeine requirement) holds via an explicit pin plus the cached-check in `download()` — warm the cache from the pin during a Docker image build.
- **`--locked` does not re-walk the dependency graph** to byte-compare a freshly computed lock. It cannot: a lock-driven install skips the versions that lost a conflict, so their manifests are never cached and `resolvePackages({skipLock: true})` throws ENOENT on a fresh clone. Instead it checks that the lock is present, parseable, current-format, pins every dependency declared in `mops.toml`, and agrees with the registry on every file hash. Closing the gap needs a per-candidate manifest fetch — a new feature, not a lockfile change.
- **`mops sources` deliberately has no `--locked`.** Its stdout is machine-parsed mid-build; enforce the lock with a preceding `mops install --locked`.
- **`mops update` keeps its name.** Under exact pins only one update operation can exist, so there is no `update`-vs-`upgrade` ambiguity. If ranges land, that is when `mops upgrade` gets _added_ alongside a redefined `mops update`.
- **`v2` is an archive, not a release line.** The branch is kept so 2.x source stays reachable without digging through tags, but nothing releases from it: `release.yml` requires every tag to be on `main`, so a `cli-v2.*` tag aborts. That is intentional — no 2.x releases are planned, and a second release path is surface for nothing. If a 2.x patch ever becomes necessary, the guard has to be widened first (see the closed [#777](https://github.com/caffeinelabs/mops/pull/777) for the shape of that change), and its docs would need porting to `main` to publish, since `v2` has no docs-deploy step.
- **Keep `cli/tests/build/no-dfx/` and `build-no-dfx.test.ts`** as a regression test that mops works with neither `dfx` nor `icp` on PATH.

## Blocked on upstream

- **GH #651** — `@dfinity/pic` is a devDependency pre-bundled into `dist/vendor/pic.mjs`, because its `postinstall` downloads a ~94 MB pocket-ic binary and throws when it cannot (a plain `dependencies` entry makes `npm i -g ic-mops` fail with no network). If upstream makes that download lazy, the vendor entry, the `vendor:pic` step, the `fix-dist` rewrite and `cli/tests/vendor-pic.test.ts` all get deleted, and dev/CI installs stop paying the 94 MB.
- **GH #655** — an upstream stderr / `onCanisterLog` hook would delete the `serverProcess` cast in `cli/helpers/pocket-ic-client.ts`.

---

## CLI — next major

### Cargo version model (gated on moc `--override` — dfinity/motoko#5124)

Adopt cargo's model end-to-end as one coherent jump once moc supports multiple versions of a package in a build:

- **Flip bare `1.2.3` to mean `^1.2.3`** in resolution + sources + install. `mops update`/`outdated` already do this (`cli/commands/available-updates.ts:53-56` has the `// Caret (cargo-style)` comment). Purely client-side reinterpretation of existing registry data — no backend migration.
- Resolver finds the _intersection_ of all constraints, picks the highest satisfying version. Fail loudly on unsatisfiable. No warning on within-major skew — that's the point of caret.
- `=1.2.3` escape hatch. Backend work: dep-version validation must accept spec strings (`validateConfig.mo:248`), the dep-exists check becomes "some version satisfies the spec" (`PackagePublisher.mo:106-118`), alias prefix check fix (`validateConfig.mo:262`), display paths like `getPackageSummary.mo:105`. Non-breaking canister upgrade (accepts a superset), deployable ahead of time. Ecosystem forward-compat window needed: older CLIs can't parse published `=` strings — tolerate-parse (strip) `=` in 3.x CLIs early to shorten the window.
- Different-major diamonds → multi-version coexistence via moc `--override`. (GH #283)
- Decide on `^`/range syntax (and document the difference from npm). (LIN: Mops support ^versions)
- Dev-dep / prod-dep separation: today root `[dev-dependencies]` merge into the same flat resolved set (`cli/resolve-packages.ts:86-91`). Cargo separates them. Do alongside this resolver rewrite.
- Workspaces (cargo `[workspace]` / npm workspaces). Shared lockfile root, member graph, single-resolve across in-repo packages. Significant design chunk; high payoff for monorepos.
- **Migration risk**: library authors not committing lock will see within-major drift. Bounded because lock is default since 2.8, and v3's cross-major warning will have flagged conflicted graphs long before.

### Conflict reporting (parked with the above)

Both are blocked on the same thing — a cross-version conflict cannot actually be _resolved_ today without moc `--override` (GH #283), so louder reporting gives noise without a proportional action. Full detail in GH #723.

- **`0.x` minor skew is never reported.** Conflict reporting buckets by semver major, so `base 0.7.3` vs `0.16.0` both bucket to `0`. Cargo treats `0.MINOR` as the compatibility unit, and most of the Motoko ecosystem lives at `0.x`.
- **Conflict reporting is inert once `mops.lock` is fresh.** Resolution short-circuits to `lock.deps` before the reporting block runs, so warnings appear exactly once. Fix: re-derive version sightings from `lock.graph` at the short-circuit. Related to GH #683.

## CLI — additive (can ship in a 3.x minor)

- **Install-as alias** — table-stakes (cargo `package = "..."`, npm `"foo": "npm:bar@1"`). Schema + `--package` plumbing change. (GH #266)
- Local-path deps no longer require copy-pasting transitives into the parent's `mops.toml`. (GH #289)
- Expose the replica/PocketIC canister id to tests. (GH #274)
- Doc pages for `mops search` and `mops template`, which have never had one in either tree. (GH #205)

The Cargo/pnpm parity backlog — store/CAS, cache GC, `--offline`, `mops why`/`tree`/`licenses`, registry metadata cache, comment-preserving `mops.toml` writes — is tracked in GH #723. Nothing there is breaking.

## Lockfile v4 (own versioning track, not coupled to any CLI major)

Lock format versions independently of the CLI (cargo precedent: cargo is perpetually 1.x, yet shipped lock v1→v4 via read-early/write-later). Ship in two non-breaking-at-the-time phases whenever the work starts:

1. **Read support** in any regular release — extend `supportedVersions` (`cli/integrity.ts:232`), parse/verify the new fields, write nothing.
2. **Flip the write default** in a later release, once the installed base has absorbed read support.

Content: pin git deps to a **resolved commit SHA**. Today the `deps` map (`cli/integrity.ts:288-303`) stores the ref as written (`repo#v1.0.0`) — a moved tag goes unnoticed; only registry packages get file hashes (`cli/integrity.ts:69-86`). Resolve ref → SHA at lock (re)generation, verify at install. Path deps stay exempt by design (live-edited dirs; cargo precedent).

A version bump (not in-place v3 extension) is required regardless: older CLIs fail v3's exact-match `deps` check and `hashes` count check on any added fields, and the unsupported-version error (`cli/integrity.ts:253`) is a cleaner, recoverable failure. Note that **no** bump is needed for additive optional fields or sorted output on their own — validation never inspects key order or unknown fields.

## Distribution (not semver-coupled — ship whenever ready)

- True Node-less binary distribution (single executable, no `node_modules`). Today `npm i -g ic-mops` and the `cli-releases` `install.sh` both end up shelling to `npm add -g <tgz>`, so any Node-runtime / native-module bug hits both. Node SEA, `bun build --compile`, or Rust rewrite (GH #237) eliminates this whole class of install failures. (LIN: investigate publishing standalone binary)
- Rust CLI rewrite — defer or commit. (GH #237)

---

## Backend canister — breaking (versions independently)

### Persistence & runtime

- Migrate `backend/main/main-canister.mo` to `persistent actor` (EOP). Storage canister already is. Define migration for ~20 `stable var *Stable : [(K, V)]` arrays.
- Migrate `mo:base` → `mo:core` across all `backend/**/*.mo` (21 files). (GH #354)
- Store package file blobs in stable memory in storage canisters. (GH #18)

### Registry data model

- Drop legacy `PackageConfigV2` fields: `documentation`, `homepage`, `donation`, `scripts`, `dfx`, `moc`. (`backend/main/types.mo:73-80`) The CLI already rejects `dfx` in `[package]` at publish but still sends `dfx: ""` for wire compatibility.
- Drop legacy `PackageSummary.owner` / `ownerInfo` (use `owners[]`). (`types.mo:92-93`, `getPackageSummary.mo:46-47`)
- Drop legacy `packageOwners` map; keep only `ownersByPackage`. (`main-canister.mo:68`)
- Drop legacy `hasDocumentation` flag. (`types.mo:182`)
- Collapse `PackageConfigV2`/`V3`/`V3_Publishing` into a single current type. (`types.mo:62-89`)

### Resolution & storage

- Resolve dependency tree on the backend. (GH #19)
- A **certified** hash endpoint for `getFileHashesByPackageIds`, which is `public shared` today and pays consensus. **Do not** simply make it a `query`: a query reply is signed by one node, package bytes are already query-served, and that combination lets a single malicious node forge both. The legitimate version is a certified-data tree over `hashByFileId`, verified client-side. (`getFileHashesQuery` exists and is intentionally unused; a test fails if anything calls it.)
- `getHighestSemverBatch` traps at 100+ direct dependencies (`assert(list.size() < 100)`), taking down `mops outdated` and `mops update`. Paginate or return an error instead of trapping.
- Store packages as compressed tarballs with a single integrity hash; cuts storage, the per-file fan-out and per-install round-trips. (GH #291, GH #716, LIN: optimize package storage)
- Provide an incremental package index for offline/`mops verify`. (GH #291)
- Reject Git/path deps in _published_ packages (allow for dev-deps only). (GH #291)
- Publisher signatures. Hashes are computed by the registry canister itself, so registry compromise is total — there is no trust anchor independent of it. Sigstore-style signing needs new canister state and API.

### Lifecycle commands

- `yank` / `deprecate` / `unpublish` (with npm-style time/dependent restrictions). (GH #291) Priority raised by the no-`=` decision — yank is the systemic answer to "patch release X is broken" without exact pins.

### Misc

- Add canister upgrade test. (GH #169)
- `semver.mo`: support pre-release tags `1.2.3-pre.1` (`backend/main/utils/semver.mo:70`) — bundle with the spec-validator work from the cargo-model track so `semver.mo` is touched once.
- `PackagePublication.user` → `userId`. (`backend/main/types.mo:47`)

---

## Open questions

- `mops promote` — vendor-into-source workflow. (GH #281)
- Publishing non-`.mo` files. (GH #217)
- Coverage reports. (GH #45)
