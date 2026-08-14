---
slug: /mops.lock
sidebar_label: mops.lock
---

# `mops.lock` file

`mops.lock` records the exact resolved version of every dependency, plus a hash of every file of every registry dependency and the resolved commit of every GitHub dependency, so that all developers and CI environments build against identical source code.

`mops.lock` is created automatically the first time dependencies are installed, and kept up to date on every subsequent run. It is triggered by:
- `mops install`
- `mops add`
- `mops remove`
- `mops update`
- `mops sync`
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
- missing the resolved commit and content hash of a `repo = "..."` dependency, or recording a commit that `mops.toml` no longer declares
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

`--locked` requires an up-to-date lockfile and never writes it. It fails when the lockfile is missing, unparseable, not the current format, does not pin the dependencies declared in `mops.toml`, was generated before a local `path` dependency's `mops.toml` changed, does not record the resolved commit of a GitHub dependency, or records a file hash that disagrees with the Mops registry.

A lockfile whose project has a `repo = "..."` dependency (possibly transitive) but that lacks the integrity record for it — because it was written by a CLI predating GitHub-dependency coverage — fails `--locked` until a plain `mops install` regenerates it. Projects with no GitHub dependencies are unaffected.

`--locked` is available on `mops install` and on every command that installs dependencies implicitly (`mops build`, `mops check`, `mops check-candid`, `mops check-stable`, `mops test`, `mops bench`, `mops generate candid`), so a job can run `mops test --locked` with no preceding install step.

`mops sources` has no `--locked`: a packtool caller invokes it mid-build and machine-parses its stdout. Enforce the lockfile with a preceding `mops install --locked` step.

Dependency-mutating commands (`mops add`, `mops remove`, `mops update`, `mops sync`) have no `--locked` — their job is to change dependencies, so they always update the lockfile.

The `CI` environment variable does not affect lockfile behavior. Releases before 3.0 silently switched `mops install` to check mode when `CI` was set; that auto-detection was deprecated in 2.18 and removed in 3.0.

### What `--locked` does not check

`--locked` does not re-walk the dependency graph from scratch. Installing from a lockfile deliberately skips the dependency versions that lost a version conflict, so their manifests are never downloaded and a full re-resolve is not possible without giving up that optimization. In practice this is not a gap for registry dependencies: published versions are immutable, so a transitive version cannot change underneath a lockfile.

GitHub dependencies are not a gap either: the lockfile pins a commit and a hash of its contents, and the install fetches that commit and checks it (see [GitHub dependencies](#github-dependencies) below).

Local `path` dependencies are live directories, so Mops instead records a hash of the `[dependencies]` of every path dependency it reaches, transitively. Editing one of those manifests — or creating a `mops.toml` where there was none — makes the lockfile stale, so a plain `mops install` picks up the new transitive dependency and `--locked` fails instead of building against a dependency set that no longer matches. What is still not checked is the *file contents* of a local path dependency: it is a directory you edit by design and carries no published hashes.

## Integrity

File integrity is verified **at download time**: each file is hashed as it arrives, and the package is only committed to the cache if every file matches. A corrupted or tampered download therefore never reaches your project — this holds for a plain `mops install`, not only under `--locked`.

What the hashes are compared against depends on whether the lockfile already knows the package:

- **`mops.lock` records hashes for it** — those are used, and no registry call is made. The lockfile is a committed, reviewable record, so this is the same trust model `cargo` applies to `Cargo.lock`. It also means a clean checkout with a committed lockfile installs without contacting the registry for hashes at all.
- **It does not** — no lockfile, a stale one, a package new to the lockfile, or a version that lost a conflict — the hashes published in the Mops registry are fetched and used, before the package is committed to the cache.

Either way the comparison happens before anything enters the cache. Note that a plain `mops install` does not cross-check the two sources against each other: whichever answered is the one it trusts. Confirming that `mops.lock` still agrees with the registry is what [`mops verify`](./cli/1-deps/06-mops-verify.md) and `--locked` do.

### GitHub dependencies

GitHub publishes no hashes, so `mops.lock` is the whole record. For each `repo = "..."` dependency it stores the commit the source archive was fetched from, and a `sha256` over the extracted tree — every file's path and contents, sorted, so moving a file changes it as much as editing one:

```json
"github": {
  "motoko-datetime": {
    "resolved": "bda6139ec56d36731326727ae28510f1e1843f27",
    "hash": "0f4c…"
  }
}
```

The dependency value itself is stored verbatim in `deps`, exactly as `mops.toml` declares it. The commit lives beside it rather than being appended to it, so a manifest that declares a plain `#main` keeps satisfying `--locked`.

A ref that names no commit (`#main`, or a tag like `#v1.3.0`) is resolved once through the GitHub API and pinned in the lockfile. From then on Mops fetches the archive of that commit, never the ref, so **a moved tag or a force-pushed branch cannot change your build** — and it costs no further API calls. This matters because the anonymous GitHub API allows 60 requests per hour per IP: a dependency pinned in `mops.toml` (`#main@<sha>`, which is what `mops add` writes) never needs a request at all, and a lockfile that already pins one does not either. Run [`mops update`](./cli/1-deps/04-mops-update.md) to move a dependency to a newer commit.

Verification happens before the download is committed to the cache, the same as for registry packages. A tree that does not hash to the locked value fails the install and is deleted; the archive of a commit never changes, so the message says what that means — either the download is corrupt or the lockfile is. Cached content is checked too: the cache directory for a ref that names no commit is keyed by the ref, so an entry can hold source from a commit the ref no longer points at. Mops re-fetches the locked commit instead of trusting it.

If the resolved commit cannot be worked out — the API call fails, or you are offline — the install proceeds and warns that it cannot pin the dependency. Nothing is recorded rather than pairing a hash with a guessed commit, so the lockfile stays stale and the next install completes it.

`mops install` does not re-hash the contents of `.mops/` on every run. Editing a file under `.mops/` will not fail your next install — run [`mops verify`](./cli/1-deps/06-mops-verify.md) for the full on-disk audit.

## Performance

A valid `mops.lock` speeds up `mops install` because it avoids resolving intermediate dependency versions.

_It's only faster when there are no globally cached packages — for example when running `mops install` inside a fresh Docker container or for the first time in a project._

## What `mops.lock` contains

- Hash of the `[dependencies]` and `[dev-dependencies]` sections of `mops.toml`
- Hash of the `[dependencies]` of every local `path` dependency, transitively (`localDepsHash`, omitted when the project declares none)
- All transitive dependencies with the final resolved versions
- Hash of each file of each registry dependency (retrieved from the Mops registry canister)
- Resolved commit and content hash of each GitHub dependency (`github`, omitted when the project declares none)
- The declared dependencies of every registry package version in the graph (`graph`), including versions that lost a conflict and were not installed

The `graph` section lets Mops update the lock after `mops add`, `remove`, `update` or `sync` without re-downloading package manifests: published versions are immutable, so recorded dependencies never go stale. Local path dependencies are not recorded — their manifests are always read from disk. Locks written by older CLIs have no `graph`; Mops then falls back to reading manifests from the cache, downloading any that are missing.

For the same reason, updating a stale lock carries file hashes of already-locked packages over and queries the registry only for packages new to the lock. Deleting `mops.lock` and running `mops install` rebuilds every hash from the registry.

Local path dependencies are stored relative to the project root (e.g. `./packages/shared`, `../lib`) so the lockfile is portable across machines. A lockfile that still carries absolute paths from an older CLI is treated as stale and rewritten by a plain `mops install`. After regenerating, use a CLI that includes this fix; older CLIs treat relative lock paths as cwd-relative and break when run from a subdirectory.

## Key ordering

Every key Mops writes to `mops.lock` is sorted — the dependencies, the packages in `hashes`, the per-file hashes within each package, the `graph` entries and the `github` entries. Ordering never depends on how `mops.toml` lists dependencies or on the order resolution happened to visit them, so unrelated installs produce no diff churn and the file merges cleanly.

Ordering is not a correctness property: a lockfile written by an older CLI with unsorted keys stays valid, passes `mops install --locked`, and is not rewritten just for being unsorted. It is reordered the next time something legitimately updates it.

## `{MOPS_ENV}` path dependencies

A local `path` dependency may contain `{MOPS_ENV}`, which expands to the value of the `MOPS_ENV` environment variable (`local` when it is unset):

```toml
[dependencies]
envdep = "./envs/{MOPS_ENV}/dep"
```

The lockfile stores the **expanded** path, which makes it specific to the `MOPS_ENV` it was generated under. Mops therefore treats a lockfile generated under a different `MOPS_ENV` as stale: `mops install` re-resolves and rewrites it, `mops sources` reports the current environment's directories, and `mops install --locked` fails rather than building against the previous environment's paths.

The consequence for CI is that a committed lockfile only satisfies `--locked` for the `MOPS_ENV` it was generated under. If you build the same project under several environments, either run `mops install` (without `--locked`) in those jobs, or commit one lockfile per environment branch. Projects that do not use `{MOPS_ENV}` are unaffected.
