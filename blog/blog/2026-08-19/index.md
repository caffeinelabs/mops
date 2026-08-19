---
slug: mops-3-0-0
title: Mops 3.0.0
---

### Summary

- Mops manages the whole Motoko toolchain, and every version is pinned
- `dfx` support is removed — read the migration note below before upgrading
- One lockfile model: plain commands maintain `mops.lock`, `--locked` enforces it in CI
- Integrity is verified as packages download, and `mops verify` audits what is on disk
- Installs are parallel and measurably faster

<!-- truncate -->

Mops 3.0.0 is out. Install it with `npm i -g ic-mops`, or `mops self update` from an existing install.

This is the first major release since 2.0, and it is a breaking one. The [changelog](https://github.com/caffeinelabs/mops/blob/main/cli/CHANGELOG.md) opens with a **Migrating from 2.x** list — everything that requires action, in one place. If you read nothing else, read that.

## Mops owns the toolchain

Mops downloads and manages `moc`, `pocket-ic`, `wasmtime`, `lintoko` and `wasm-opt`, and in 3.0.0 every one of them is pinned in `mops.toml`. There are no silent defaults and no "latest release" lookups on the build path, so the same commit builds the same way today and next year.

```toml
[toolchain]
moc = "1.12.0"
pocket-ic = "15.0.0"
```

Commands that compile now require a `moc` pin, and replica tests, `mops bench` and `--check-deploy` require a `pocket-ic` pin. Unpinned, they stop with an error naming the exact command to run.

The one place this bites an existing project is `[optimize]`. In 2.x, a project with `[optimize]` and no `wasm-opt` pin had its `mops.toml` rewritten by the next build, with the version chosen by a network lookup at build time. That is gone: pin Binaryen with `mops toolchain use wasm-opt <version>` and commit it. A `wasm-opt` failure now fails the build instead of quietly shipping an unoptimized module.

## dfx support is removed

**If you deploy with dfx, read this before upgrading.**

Mops neither invokes dfx nor supports projects that build with it. `dfx` does not need to be installed, and nothing mops does reaches it.

The change that will surprise people is `mops toolchain init`. Its job was exporting `DFX_MOC_PATH=moc-wrapper` so `dfx build` compiled with your pinned `moc`. Both it and the `moc-wrapper` binary are gone. Concretely:

- **Delete `export DFX_MOC_PATH=moc-wrapper` from your shell config.** While it points at the removed binary, `dfx build` fails outright.
- [`mops sources`](https://docs.mops.one/cli/mops-sources) is unchanged, byte for byte. dfx keeps resolving your mops dependencies through it as a packtool.
- But `dfx build` now uses its own bundled compiler while `mops check` / `build` / `test` use your pinned one. A program that passes `mops check` can build differently, or not at all, under dfx. In GitHub Actions the same applies silently — mops no longer writes `DFX_MOC_PATH` into `$GITHUB_ENV`, so a workflow stays green while compiling with a different `moc`.

The supported path is [`icp`](https://js.icp.build/), whose Motoko recipe builds by invoking `mops build`, so your pin propagates. If you stay on dfx, set `DFX_MOC_PATH` yourself and keep it in step with `[toolchain] moc`.

Also gone with dfx: the `--replica` flag on `mops test` and `mops bench` (PocketIC is always used), `mops watch --deploy` and `--generate`, and the `dfx` field in `[package]`.

One thing to expect rather than fix: **benchmark baselines drift.** PocketIC and the dfx replica report different instruction and heap counts, so your first `mops bench --compare` after upgrading shows a large diff wherever a dfx replica was implicitly in use. That is a change of measuring instrument, not a regression — re-record with `mops bench --save`.

## One lockfile model

`--lock <check|update|ignore>` is replaced by a single boolean flag, following cargo:

- Plain commands are the dev flow. They maintain `mops.lock`, and a missing, unparseable or inconsistent lockfile is **regenerated** rather than treated as an error.
- [`--locked`](https://docs.mops.one/cli/mops-install) is the CI flow. It requires an up-to-date lockfile and never writes one, so a CI run cannot mutate it.

`--locked` is accepted by `mops install` **and** every command that installs implicitly — `build`, `check`, `check-candid`, `check-stable`, `test`, `bench`, `generate candid` — so a pipeline can run `mops test --locked` with no separate install step.

The `CI` environment variable no longer switches `mops install` into check mode. CI opts in explicitly now.

And the guidance changed: **commit `mops.lock`, libraries included.** A library's lock has no effect on consumers — they resolve their own graph — and it makes the library's own CI reproducible.

## Integrity moved to download time

Files are hashed as they arrive and compared against the registry before a package is committed to the cache, so a corrupted download never reaches your project. That replaces re-hashing all of `.mops/` on every install, which cost time proportional to your whole dependency tree on every single command.

The tradeoff is worth stating plainly: editing a file under `.mops/` no longer fails your next install. Installs are not a tamper gate for files already on disk. If you want that audit, it is now a command:

```bash
mops verify
```

[`mops verify`](https://docs.mops.one/cli/mops-verify) re-hashes every file the lockfile records and checks the lock against `mops.toml` and the registry.

## Faster

Packages download through a bounded pool instead of one at a time, sharing a request budget derived from your CPU count and file-descriptor limit. Registry hash lookups are batched into a single call that starts before the downloads, so the consensus round overlaps them. Dependency resolution runs once per command instead of three to five times. A cold install of 8 root packages plus transitives went from 19.7 s to 13.2 s, and roughly 1.5 s of fixed cost came off every warm-cache run.

Installs also self-heal on transient network failures: a `fetch failed`, `ECONNRESET` or `EMFILE` retries with the request concurrency halved rather than aborting the command.

## Everything else

Node.js >= 20 is required. `mops set-network` and `mops get-network` are gone in favour of `MOPS_NETWORK`. Vessel migration is removed. Errors now go to stderr, and exit codes are consistent across `mops update`, `outdated` and the commands that need a `mops.toml`. Unknown flags before `--` are rejected instead of silently swallowed.

The full list, grouped by theme, is in the [changelog](https://github.com/caffeinelabs/mops/blob/main/cli/CHANGELOG.md).

The 2.x documentation stays available at [docs.mops.one/2.x](https://docs.mops.one/2.x).
