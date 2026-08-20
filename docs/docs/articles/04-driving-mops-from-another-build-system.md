---
slug: /articles/driving-mops-from-another-build-system
sidebar_label: Driving mops from another build system
---

# Driving mops from another build system

The rest of these docs assume a person at a terminal. This page is for the other case: a build system, CI pipeline or canister orchestrator that invokes mops non-interactively and has to reason about what it did. It covers what each command writes, what touches the network, how to read the exit codes, and how to extract the facts a build record needs.

## The pipeline

```bash
mops install --locked          # acquire dependencies; fails if mops.lock is stale
mops verify                    # re-hash what is on disk against the lockfile
mops check --locked            # type-check without producing artifacts
mops build --locked --output out/
```

Each step is optional except the last, but the order matters: `--locked` refuses to re-resolve or rewrite `mops.lock`, so a pipeline that never runs it can silently build against a lockfile it ignored.

`--locked` is accepted by `install` **and** by every command that installs implicitly (`build`, `check`, `check-candid`, `check-stable`, `test`, `bench`, `generate candid`), so a pipeline can run `mops build --locked` with no separate install step. It fails when `mops.lock` is missing, unparseable, not the current format version, inconsistent with `mops.toml`, or records a file hash the registry disagrees with.

:::warning
`--locked` does **not** detect tampering with files already on disk. It checks the lockfile against `mops.toml` and against the hashes the registry publishes — not the bytes in `.mops/`. Since 3.0.0, integrity is verified when a package is downloaded rather than by re-hashing `.mops/` on every install, so editing a file there afterwards does not fail a subsequent build. [`mops verify`](../cli/1-deps/06-mops-verify.md) is the on-disk gate: it re-hashes every file the lockfile records. Run it explicitly if your threat model includes the build inputs changing after acquisition.
:::

## What each command writes

| Command | Writes |
|---|---|
| `install` | `.mops/` (project-local), the global package cache, and `mops.lock` — unless `--locked` |
| `install --locked` | `.mops/` and the global cache only; never `mops.lock` |
| `verify` | nothing |
| `check`, `check-stable`, `check-candid` | nothing beyond what an implicit install writes |
| `build` | `--output` (default `.mops/.build`), plus a `.<canister>.buildlock` there |
| `sources`, `moc-args`, `toolchain bin` | nothing; stdout only |

Two locations are involved. `.mops/` is project-local, next to `mops.toml`, and is safe to delete — the next install repopulates it. Toolchain binaries and the package cache live in a per-user global cache, relocatable with `XDG_CACHE_HOME`, which is what to point at a warm volume in a container build.

No build command writes `mops.toml`. If a required pin is missing — `[toolchain] moc`, or `[toolchain] wasm-opt` when `[optimize]` is set — the command fails naming the `mops toolchain use` invocation that fixes it, rather than choosing a version for you.

## What touches the network

| Step | Network |
|---|---|
| Downloading a package absent from the cache | registry canister + storage canisters |
| Downloading a toolchain binary absent from the cache | GitHub releases |
| Validating or writing `mops.lock` | registry query for the published file hashes |
| `mops verify` | the same registry query |
| Reporting a new install | one best-effort update call to the registry |
| `sources`, `moc-args`, `toolchain bin`, and compilation itself | none |

The lock check is the one that surprises people. `--locked` compares the recorded hashes against what the registry currently publishes, so it reaches the registry on **every** run — a warm `.mops/` avoids the downloads, not the query. A plain install does the same while rebuilding the lock.

The install-reporting call is the exception: it feeds package download counts, fires only for packages newly copied into `.mops/`, and has its errors swallowed, so it never fails a build.

:::warning
There is no fully offline mode. Pre-warming both caches — `mops install` for packages, `mops toolchain use <tool> <version>` for binaries, worth doing in a container image build since PocketIC alone is a ~90 MB download — removes the download traffic, but the lock check still queries the registry. A pipeline that must not reach the network at all has no supported way to express that yet.
:::

What mops does *not* do at build time is resolve a version. Every tool version comes from `[toolchain]` in `mops.toml`, or for PocketIC a constant compiled into the CLI, so no build depends on what happens to be the latest release that day.

## Exit codes

`0` success, `1` a mops-level error (bad config, failed integrity check, missing pin).

`mops build` and `mops check` pass the compiler's exit code through unchanged, which distinguishes two cases a pipeline should treat differently: `1` means the Motoko source was rejected — a user error, and the diagnostics on stderr are the answer — while `2` means `moc` itself crashed, which is a toolchain bug worth reporting rather than a code change.

## Reading the build back out

There is no single machine-readable build record yet. These commands are the introspection surface:

| Command | Output |
|---|---|
| `mops --version` | the CLI version |
| `mops toolchain bin moc` | absolute path to the pinned compiler — hash this for provenance |
| `mops sources` | one `--package <name> <dir>` pair per resolved dependency |
| `mops moc-args` | the `moc` flags mops derives from `mops.toml` |

`mops sources` is designed to be parsed: its stdout is stable and it prints nothing else. It deliberately has **no** `--locked` — it runs mid-build where writing a lockfile or printing integrity output would corrupt what the caller is parsing. Enforce the lock with an earlier `mops install --locked` instead; a pipeline that only ever calls `sources` gets no lock enforcement.

## Build artifacts

`mops build` writes `<canister>.wasm`, `<canister>.did` and `<canister>.most` into the output directory, flat — one directory for all canisters, so canister names must be unique (they already are, being `mops.toml` keys). Nothing is gzipped: compressing for deployment is the consumer's job.

Builds are reproducible. The same source, lockfile and pinned toolchain produce byte-identical artifacts, and the test suite asserts it. Note that the compiler version is recorded inside the Wasm in a `motoko:compiler` custom section, so changing `[toolchain] moc` changes the artifact hash — which is the point, not a defect.

## Passing flags to moc

Anything after `--` goes to `moc` verbatim, on both `build` and `check`:

```bash
mops build backend -- --package generated ./generated
```

mops assembles the compiler arguments as: one `--package` per resolved dependency, then `[moc].args`, migrations, `[build].args`, `[canisters.<name>].args`, and finally the CLI extras. Because the extras land last, an injected `--package` wins over an identically-named resolved dependency — which is how a generated package is supplied without editing `mops.toml` or `mops.lock`.

Flags mops manages itself are rejected with a warning if passed this way, since mops derives them from `mops.toml` and a second copy would conflict. `--package` is not one of them.

:::note
If you inject a package this way, pass the identical flags to `mops check` and `mops build` — they resolve arguments independently, and only the command you passed them to will see them.
:::
