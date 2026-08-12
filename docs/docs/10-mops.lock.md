---
slug: /mops.lock
sidebar_label: mops.lock
---

# `mops.lock` file

`mops.lock` records the exact resolved version of every dependency, plus a hash of every file of every registry dependency, so that all developers and CI environments build against identical source code.

`mops.lock` is created automatically the first time dependencies are installed, and kept up to date on every subsequent run. It is triggered by:
- `mops install`
- `mops add`
- `mops remove`
- `mops update`
- `mops sync`
- `mops init` (when it installs dependencies)
- commands that install dependencies implicitly: `mops build`, `mops check`, `mops check-stable`, `mops check-candid`, `mops test`, `mops bench`, `mops generate candid`

`mops.lock` is maintained by Mops and should not be manually edited. There is no way to opt out of it.

## Should you commit `mops.lock`?

**Yes — commit it, for applications and libraries alike.**

For applications (canisters, scripts, frontends) this guarantees that every developer and CI environment installs the exact same dependency versions.

For libraries it makes your own CI reproducible and gives contributors a known-good dependency set to start from. Your lockfile has no effect on projects that depend on your library: consumers resolve their own graph and write their own lockfile, so committing yours cannot pin anything for them.

This reverses earlier guidance, which told library authors to add `mops.lock` to `.gitignore`. If you have that entry, remove it and commit the lockfile:

```bash
# no longer recommended — delete this line from .gitignore
mops.lock
```

## Self-healing

`mops install` regenerates the lockfile rather than failing when it is:
- missing
- unparseable
- an older format version
- inconsistent with the `[dependencies]` / `[dev-dependencies]` in `mops.toml`
- pinning a dependency to a different version than `mops.toml` declares
- recording file hashes for packages that are not in its own `deps`
- carrying absolute local `path` dependencies written by an older CLI
- generated before a local `path` dependency's own `mops.toml` changed, or under a different `MOPS_ENV`

A broken lockfile is only a dead end under [`--locked`](#ci-environments), where failing is the point.

One case is deliberately not self-healed: a lockfile whose recorded file *hash values* are wrong, which you can only get by hand-editing it or botching a merge. Noticing that requires a registry call that costs about a second, and paying it on every install would cost more than it saves. Those hashes are only read by `--locked` and `mops verify`, never by the build, so a wrong hash cannot give you a wrong build. Both commands report it and tell you to restore `mops.lock` from version control, or delete it and run `mops install`.

## CI environments

Pass `--locked` and commit `mops.lock`:

```yaml
- run: mops install --locked
- run: mops test --locked
```

`--locked` requires an up-to-date lockfile and never writes it. It fails when the lockfile is missing, unparseable, not the current format, does not pin the dependencies declared in `mops.toml`, was generated before a local `path` dependency's `mops.toml` changed, or records a file hash that disagrees with the Mops registry.

`--locked` is available on `mops install` and on every command that installs dependencies implicitly (`mops build`, `mops check`, `mops check-candid`, `mops check-stable`, `mops test`, `mops bench`, `mops generate candid`), so a job can run `mops test --locked` with no preceding install step.

`mops sources` has no `--locked`: a packtool caller invokes it mid-build and machine-parses its stdout. Enforce the lockfile with a preceding `mops install --locked` step.

Dependency-mutating commands (`mops add`, `mops remove`, `mops update`, `mops sync`) have no `--locked` — their job is to change dependencies, so they always update the lockfile.

The `CI` environment variable does not affect lockfile behavior. Releases before 3.0 silently switched `mops install` to check mode when `CI` was set; that auto-detection was deprecated in 2.18 and removed in 3.0.

### What `--locked` does not check

`--locked` does not re-walk the dependency graph from scratch. Installing from a lockfile deliberately skips the dependency versions that lost a version conflict, so their manifests are never downloaded and a full re-resolve is not possible without giving up that optimization. In practice this is not a gap for registry dependencies: published versions are immutable, so a transitive version cannot change underneath a lockfile.

Local `path` dependencies are live directories, so Mops instead records a hash of the `[dependencies]` of every path dependency it reaches, transitively. Editing one of those manifests — or creating a `mops.toml` where there was none — makes the lockfile stale, so a plain `mops install` picks up the new transitive dependency and `--locked` fails instead of building against a dependency set that no longer matches. What is still not checked is the *file contents* of a local path dependency: it is a directory you edit by design and carries no published hashes.

## Integrity

File integrity is verified **at download time**: each file is hashed as it arrives, and the package is only committed to the cache if every file matches. A corrupted or tampered download therefore never reaches your project — this holds for a plain `mops install`, not only under `--locked`.

What the hashes are compared against depends on whether the lockfile already knows the package:

- **`mops.lock` records hashes for it** — those are used, and no registry call is made. The lockfile is a committed, reviewable record, so this is the same trust model `cargo` applies to `Cargo.lock`. It also means a clean checkout with a committed lockfile installs without contacting the registry for hashes at all.
- **It does not** — no lockfile, a stale one, a package new to the lockfile, or a version that lost a conflict — the hashes published in the Mops registry are fetched and used, before the package is committed to the cache.

Either way the comparison happens before anything enters the cache. Note that a plain `mops install` does not cross-check the two sources against each other: whichever answered is the one it trusts. Confirming that `mops.lock` still agrees with the registry is what [`mops verify`](./cli/1-deps/06-mops-verify.md) and `--locked` do.

`mops install` does not re-hash the contents of `.mops/` on every run. Editing a file under `.mops/` will not fail your next install — run [`mops verify`](./cli/1-deps/06-mops-verify.md) for the full on-disk audit.

## Performance

A valid `mops.lock` speeds up `mops install` because it avoids resolving intermediate dependency versions.

_It's only faster when there are no globally cached packages — for example when running `mops install` inside a fresh Docker container or for the first time in a project._

## What `mops.lock` contains

- Hash of the `[dependencies]` and `[dev-dependencies]` sections of `mops.toml`
- Hash of the `[dependencies]` of every local `path` dependency, transitively (`localDepsHash`, omitted when the project declares none)
- All transitive dependencies with the final resolved versions
- Hash of each file of each registry dependency (retrieved from the Mops registry canister)
- The declared dependencies of every registry package version in the graph (`graph`), including versions that lost a conflict and were not installed

The `graph` section lets Mops update the lock after `mops add`, `remove`, `update` or `sync` without re-downloading package manifests: published versions are immutable, so recorded dependencies never go stale. Local path dependencies are not recorded — their manifests are always read from disk. Locks written by older CLIs have no `graph`; Mops then falls back to reading manifests from the cache, downloading any that are missing.

For the same reason, updating a stale lock carries file hashes of already-locked packages over and queries the registry only for packages new to the lock. Deleting `mops.lock` and running `mops install` rebuilds every hash from the registry.

Local path dependencies are stored relative to the project root (e.g. `./packages/shared`, `../lib`) so the lockfile is portable across machines. A lockfile that still carries absolute paths from an older CLI is treated as stale and rewritten by a plain `mops install`. After regenerating, use a CLI that includes this fix; older CLIs treat relative lock paths as cwd-relative and break when run from a subdirectory.

## `{MOPS_ENV}` path dependencies

A local `path` dependency may contain `{MOPS_ENV}`, which expands to the value of the `MOPS_ENV` environment variable (`local` when it is unset):

```toml
[dependencies]
envdep = "./envs/{MOPS_ENV}/dep"
```

The lockfile stores the **expanded** path, which makes it specific to the `MOPS_ENV` it was generated under. Mops therefore treats a lockfile generated under a different `MOPS_ENV` as stale: `mops install` re-resolves and rewrites it, `mops sources` reports the current environment's directories, and `mops install --locked` fails rather than building against the previous environment's paths.

The consequence for CI is that a committed lockfile only satisfies `--locked` for the `MOPS_ENV` it was generated under. If you build the same project under several environments, either run `mops install` (without `--locked`) in those jobs, or commit one lockfile per environment branch. Projects that do not use `{MOPS_ENV}` are unaffected.
