---
slug: /cli/mops-publish
sidebar_label: mops publish
---

# `mops publish`

Publish package to the mops registry
```
mops publish
```

You need to [import identity](/cli/mops-user-import) before publishing a package.

Tests will be run before publishing to ensure the package works correctly.

Documentation for the package will be generated automatically from the source code(`src` folder) and published to the registry.

### Benchmarks

Benchmarks will be run with `pocket-ic` replica if it is present in `mops.toml`, otherwise `dfx` replica will be used.

Benchmark results will be published to the registry.

You can view the results on the package page in the `Benchmarks` tab.

You can also view the diff of the benchmark results between the current version and the previous version in the `Versions` tab. Benchmarks compared by file name, not by the benchmark name.

## File limit

Packages may contain up to **1000 files**. If your package exceeds this limit, `mops publish` will exit early with an error before contacting the registry.

## Dry run

Run the same local preflight checks as `mops publish` before upload, and on success print the files that would be uploaded — without contacting the network or uploading anything:

```
mops publish --dry-run
```

Does **not** require an imported identity and does **not** contact the network.

Covers field length limits, dependency shape (no local or GitHub deps), required files (`mops.toml`, `README.md`), allowed extensions, and the file-count limit.

Does **not** run tests, generate docs, run benchmarks, or run canister config validation (SPDX license, semver, name charset/reserved names, keyword format). Also does not prove registry acceptance (already published, permissions, missing deps). A real `mops publish` can still fail after a successful dry run. Generated `docs.tgz` is also not included in the dry-run file list (it is added only during a real publish when docs are enabled).

## Options

`--dry-run` - Validate local packaging rules and list files without publishing

`--no-docs` - Do not generate docs

`--no-test` - Do not run tests

`--no-bench` - Do not run benchmarks

`--verbose` - Verbose output (print file names to be uploaded; on `--dry-run` the file list is always printed)
