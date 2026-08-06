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

A broken lockfile is only a dead end under [`--locked`](#ci-environments), where failing is the point.

One case is deliberately not self-healed: a lockfile whose recorded file *hash values* are wrong, which you can only get by hand-editing it or botching a merge. Noticing that requires a registry call that costs about a second, and paying it on every install would cost more than it saves. Those hashes are only read by `--locked` and `mops verify`, never by the build, so a wrong hash cannot give you a wrong build. Both commands report it and tell you to restore `mops.lock` from version control, or delete it and run `mops install`.

## CI environments

Pass `--locked` and commit `mops.lock`:

```yaml
- run: mops install --locked
- run: mops test --locked
```

`--locked` requires an up-to-date lockfile and never writes it. It fails when the lockfile is missing, unparseable, not the current format, does not pin the dependencies declared in `mops.toml`, or records a file hash that disagrees with the Mops registry.

`--locked` is available on `mops install` and on every command that installs dependencies implicitly (`mops build`, `mops check`, `mops check-candid`, `mops check-stable`, `mops test`, `mops bench`, `mops generate candid`), so a job can run `mops test --locked` with no preceding install step.

`mops sources` has no `--locked`: the dfx packtool invokes it mid-build and machine-parses its stdout. Enforce the lockfile with a preceding `mops install --locked` step.

Dependency-mutating commands (`mops add`, `mops remove`, `mops update`, `mops sync`) have no `--locked` — their job is to change dependencies, so they always update the lockfile.

The `CI` environment variable does not affect lockfile behavior. Releases before 3.0 silently switched `mops install` to check mode when `CI` was set; that auto-detection was deprecated in 2.18 and removed in 3.0.

### What `--locked` does not check

`--locked` does not re-walk the dependency graph from scratch. Installing from a lockfile deliberately skips the dependency versions that lost a version conflict, so their manifests are never downloaded and a full re-resolve is not possible without giving up that optimization. In practice this is not a gap for registry dependencies: published versions are immutable, so a transitive version cannot change underneath a lockfile. It does mean that transitive changes reached through a local `path` dependency are not detected by `--locked`.

## Integrity

File integrity is verified **at download time**: each file is hashed as it arrives and compared against the hash published in the Mops registry, and the package is only committed to the cache if every file matches. A corrupted or tampered download therefore never reaches your project.

`mops install` does not re-hash the contents of `.mops/` on every run. Editing a file under `.mops/` will not fail your next install — run [`mops verify`](/cli/mops-verify) for the full on-disk audit.

## Performance

A valid `mops.lock` speeds up `mops install` because it avoids resolving intermediate dependency versions.

_It's only faster when there are no globally cached packages — for example when running `mops install` inside a fresh Docker container or for the first time in a project._

## What `mops.lock` contains

- Hash of the `[dependencies]` and `[dev-dependencies]` sections of `mops.toml`
- All transitive dependencies with the final resolved versions
- Hash of each file of each registry dependency (retrieved from the Mops registry canister)

Local path dependencies are stored relative to the project root (e.g. `./packages/shared`, `../lib`) so the lockfile is portable across machines. A lockfile that still carries absolute paths from an older CLI is treated as stale and rewritten by a plain `mops install`. After regenerating, use a CLI that includes this fix; older CLIs treat relative lock paths as cwd-relative and break when run from a subdirectory.
