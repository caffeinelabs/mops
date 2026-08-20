---
slug: /cli/mops-publish
sidebar_label: mops publish
---

# `mops publish`

Publish package to the mops registry
```
mops publish
```

You need to [import identity](../3-user/01-mops-user-import.md) before publishing a package.

Tests will be run before publishing to ensure the package works correctly.

Documentation for the package will be generated automatically from the source code(`src` folder) and published to the registry.

### Benchmarks

Benchmarks will be run on the PocketIC replica — the `pocket-ic` version pinned in `mops.toml` under `[toolchain]`, or an already-running server when [`MOPS_POCKET_IC_URL`](../7-misc/06-environment-variables.md#mops_pocket_ic_url) is set. There is no default; pin one with [`mops toolchain use pocket-ic 15.0.0`](../5-toolchain/03-mops-toolchain-use.md).

Benchmark results will be published to the registry.

You can view the results on the package page in the `Benchmarks` tab.

You can also view the diff of the benchmark results between the current version and the previous version in the `Versions` tab. Benchmarks compared by file name, not by the benchmark name.

## File limit

Packages may contain up to **1000 files**. If your package exceeds this limit, `mops publish` will exit early with an error before contacting the registry.

## Dry run

Run the same local publish steps as `mops publish` (packaging checks, docs, changelog, tests, benchmarks) and on success print the final file list — without contacting the registry or uploading anything:

```
mops publish --dry-run
```

Does **not** require an imported identity and does **not** contact the mops registry. `--no-docs`, `--no-test`, and `--no-bench` work the same as for a real publish.

May still fetch GitHub release notes when `CHANGELOG.md` has no entry for the version and `[package].repository` is a GitHub URL (same as a real publish).

Does **not** run canister config validation (SPDX license, semver, name charset/reserved names, keyword format) or prove registry acceptance (already published, permissions, missing deps). A real `mops publish` can still fail after a successful dry run.

When docs are enabled, the file list includes the generated `docs.tgz` (cleaned up after the dry run).

## Options

`--dry-run` - Run local publish steps without contacting the registry or uploading

`--no-docs` - Do not generate docs

`--no-test` - Do not run tests

`--no-bench` - Do not run benchmarks

`--verbose` - Verbose output (print file names to be uploaded; on `--dry-run` the final file list is always printed)
