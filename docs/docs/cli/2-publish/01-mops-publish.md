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

## Options

`--no-docs` - Do not generate docs

`--no-test` - Do not run tests

`--no-bench` - Do not run benchmarks

`--verbose` - Verbose output (print file names to be uploaded)

