---
slug: /cli/mops-install
sidebar_label: mops install
---

# `mops install`

Install all dependencies specified in mops.toml
```
mops install
```

## Lockfile behavior

The lockfile is considered **up to date** when it is the current format and consistent with the current inputs: the `[dependencies]` / `[dev-dependencies]` in `mops.toml`, the manifests of local `path` dependencies (under the current `MOPS_ENV`), and the resolved commits of GitHub dependencies. See [self-healing](../../10-mops.lock.md#self-healing) for the full list of defects that make a lockfile stale.

- **Lockfile up to date** — installs the exact versions recorded in the lockfile, skipping dependency resolution.
- **Lockfile missing or out of date** — runs full dependency resolution, installs resolved versions, then creates/updates the lockfile.

`mops install` is self-healing: a missing, unparseable, legacy-format or inconsistent lockfile is regenerated rather than treated as an error. There is no flag to opt out of the lockfile — it is always maintained.

See [mops.lock](../../10-mops.lock.md) for details on lockfile contents and when to commit it.

## Version conflicts

When dependency resolution runs, `mops install` reports any **registry** dependency that two packages in the graph request at different **major** versions:

```
Warning! Conflicting major versions of dependency "test"
  test 1.2.0 is a dependency of legacy@1.0.0
  test 2.1.2 is a dependency of my-app@1.0.0
  Resolved to test 2.1.2 — dependents on another major compile against an API they did not ask for.
  If you want a different version, pin it in your root mops.toml — a root dependency always wins.
```

Resolution still succeeds: the highest major wins, unless your own `mops.toml` pins the dependency, in which case yours wins. Packages differing only in minor or patch version are not conflicts and are not reported. Neither are `repo` or `path` dependencies, which carry no comparable major version.

Since resolution is skipped when the lockfile is up to date, the report appears on the run that creates or updates `mops.lock`. If you have reviewed a conflict and decided to keep it, [`mops sources --conflicts ignore`](../7-misc/04-mops-sources.md#--conflicts-action) silences it there.

## Options

### `--locked`

Require an up-to-date [lockfile](../../10-mops.lock.md) and never write it. This is the flag for CI.

`mops install --locked` fails when:
- `mops.lock` is missing
- `mops.lock` cannot be parsed, or is not the current format version
- `mops.toml` declares dependencies that `mops.lock` does not pin to the same values
- a local `path` dependency's `mops.toml` changed since the lockfile was written, or the lockfile was generated under a different `MOPS_ENV`
- the lockfile carries absolute local `path` entries written by an older CLI
- a GitHub dependency lacks its recorded commit and content hash, or records a commit that `mops.toml` no longer declares
- a file hash in `mops.lock` does not match the Mops registry

On success, `mops.lock` is left byte-for-byte untouched.

`--locked` is also available on every command that installs dependencies implicitly — `mops build`, `mops check`, `mops check-candid`, `mops check-stable`, `mops test`, `mops bench` and `mops generate candid` — so a CI job can run `mops test --locked` without a preceding install step.

```bash
mops install --locked   # CI: fail rather than update the lockfile
mops install            # dev: keep the lockfile in sync
```

`mops sources` deliberately has no `--locked`: it is invoked as a packtool in the middle of another tool's build, and its stdout is machine-parsed. Enforce the lockfile with a preceding `mops install --locked` step instead.

### `--concurrency <n>`

Maximum number of simultaneous registry requests (an integer ≥ 1). The default is derived from the CPU count (2 × cores, clamped to 4–16) and capped by the file-descriptor soft limit (`ulimit -n`), so a small container gets a budget it can survive and a big machine saturates the registry.

The same limit can be set with the [`MOPS_CONCURRENCY`](../7-misc/06-environment-variables.md#mops_concurrency) environment variable, which also covers every other command that installs packages (`mops build`, `mops test`, `mops sources`, ...) and works where the command line cannot be edited — Docker builds, prebuilt CI images. The flag wins over the environment variable.

```bash
mops install --concurrency 4
MOPS_CONCURRENCY=1 mops build   # fully serial downloads
```

When an install hits a transient network or file-descriptor error (`fetch failed`, `ECONNRESET`, `EMFILE`, ...), it retries up to twice with the concurrency halved — already downloaded packages come from the cache, so only the failures are re-fetched. The halving applies even when the limit was set explicitly.

### `--no-toolchain`

Do not install toolchain.

### `--verbose`

Verbose output.

## CI

Pass `--locked` explicitly and commit `mops.lock`:

```yaml
- run: mops install --locked
- run: mops test --locked
```

The `CI` environment variable no longer changes lockfile behavior. Earlier releases silently switched `mops install` to check mode when `CI` was set (deprecated since 2.18); that auto-detection was removed in 3.0.

## Verifying installed files

`mops install` verifies each downloaded file against the registry's published hash *as it arrives*, before it is committed to the cache — so a corrupted or tampered download never reaches your project. It does not re-hash the contents of `.mops/` on every run.

To audit what is currently on disk, run [`mops verify`](./06-mops-verify.md).
