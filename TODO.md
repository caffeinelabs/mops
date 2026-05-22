# TODO

Non-breaking work that can ship without waiting for v3. For breaking changes, see `NEXT-MAJOR.md`.

Refs: GH = `caffeinelabs/mops`, LIN = Linear ticket title.

---

## Pure additions

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

---

## Schema-additive (old syntax still parses)

- **Cargo-style version syntax** — phased to avoid breaking old CLIs (`Semver.validate` is strict `xx.xx.xx` today — old CLIs would crash on `^1.2.3` in a fetched `mops.toml`):
  1. **2.x CLI-only**: parse `=`/`^`/`~`/`>=,<` and respect them **only in the consuming app's `mops.toml`** (root + local-path deps). `mops publish` keeps rejecting non-bare versions client-side. Zero risk for old CLIs.
  2. **Coordinated CLI + backend with `apiVersion` major bump**: backend `Semver.validate` accepts new syntax (`backend/main/utils/semver.mo:71`); `mops publish` allows it in published `[dependencies]`. Old CLIs hit the existing major-mismatch path (`cli/mops.ts:289-300`) and refuse with "upgrade required" instead of crashing.
  3. **v3+**: deprecation warning when a bare pin is silently overridden by max-wins; flip bare `1.2.3` to mean `^1.2.3`. (see `NEXT-MAJOR.md`)
- Install-as alias: new `foo = { name = "core", … }` form, plain string still works. (GH #266)
- Packages can declare exported `.did` files in `mops.toml`; CLI auto-injects matching `--actor-id-alias` moc flags (mirrors how lintoko rules are exported). Ship a separate `ic-did` package for the management canister, auto-published with major bumps on Motoko-incompatible changes. Replaces the broken-today manual download/commit workflow. (LANG-1280, GH #492)
- Multi-version: schema can land before moc `--override`; resolver rejects until then. (GH #283)
- Local-path transitives: relax remaining edge-cases (today `installLocalDep` recurses but resolver edges still misbehave). (GH #289)

---

## Deprecate-now-remove-in-v3

- `MOPS_*` env-var overrides (`MOPS_NETWORK`, `MOPS_REGISTRY_HOST`, `MOPS_REGISTRY_CANISTER_ID`, `MOPS_VERIFY_QUERY_SIGNATURES`, `MOPS_CWD`, `MOPS_ENV`): document, log when active, add proper flag equivalents. Today they silently change registry/network/cwd. (`cli/api/network.ts`, `cli/api/actors.ts`, `cli/cli.ts:72`)
- `GITHUB_ENV`-triggered concurrency change (`cli/commands/install/install-mops-dep.ts:85`) — replace with explicit `--concurrency` flag.
- Vessel / dhall: emit one-time warning on `mops init` when `vessel.dhall` is present (`cli/commands/init.ts:39-55`); remove in v3. (GH #296)
- `dfx`-bundled moc fallback: warn on every fallback today (`cli/commands/toolchain/index.ts:359,387`, `cli/commands/docs.ts:44-54`); drop in v3.
- WASI `wasmtime` PATH fallback already labelled "legacy" — already warns (`cli/commands/test/test.ts:270-280`); remove in v3.
- `// compatibility with older versions` re-exports (`cli/mops.ts:324-325`): mark `@deprecated`, document successors.
- `--legacy-persistence` default in `bench` (`cli/commands/bench.ts:253`): one-line deprecation when used.

---

## Defaults that should be config-flag first

- `mops watch --format`: gate behind `[watch] format = true` in 2.x; flip default in v3.
- Test reporter: `[test] reporter = "verbose"` opt-in; flip default in v3.
- Lintoko on `check`: already runs when pinned (2.6) — fine. The "always-on" flip waits for v3.

---

## CLI cleanup / modernization

- HTTP layer: respect `HTTP_PROXY`/`HTTPS_PROXY`, raise TCP timeouts, fix Docker-on-mac hangs. (GH #228, #256, #304)
- Reduce bundle size: `glob` → `tinyglobby`, `tar` → `tar-fs + node:zlib`, `decomp-tarxz` → `xz-decompress`. (GH #296)
- Remove transitive deprecation warnings on `npm i -g ic-mops` (`@dfinity/*` → `@icp-sdk/core/*`, old `glob`, etc.). (LIN: remove deprecation warnings)
- Update `bench` internal canister to `core`. (GH #354, LIN)
- Drop `--legacy-persistence` default in `bench` (`cli/commands/bench.ts:253`).
- Switch `@iarna/toml` → `smol-toml` (`cli/mops.ts:5`). Active maintenance, ~5x faster parse, smaller bundle, better TOML 1.0 compliance. Round-trip reformat behavior of `writeConfig` (`cli/mops.ts:229-257`) is unchanged — both are value-only parsers; comments and key ordering are still lost on `add`/`remove`/`bump`/`toolchain use`/`init`. Format preservation is a separate, harder problem (would need `@taplo/lib` or surgical string edits).

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
