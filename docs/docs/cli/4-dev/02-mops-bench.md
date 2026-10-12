---
slug: /cli/mops-bench
sidebar_label: mops bench
---

# `mops bench`

Run Motoko benchmarks.

```
mops bench [filter]
```

Put your benchmark code in `*.bench.mo` files inside a `bench/` or `benchmark/` directory (nested subdirectories work too). With a `[filter]` argument, every `*<filter>*.mo` file under those directories runs — the `.bench.mo` suffix is not required for filtered files.

Directories below the project root that are their own checkout — a git worktree, a submodule, a nested clone — are skipped, so a copy of the project checked out beside it does not contribute benchmarks.

It is necessary to use [bench package](https://mops.one/bench) to write benchmarks.

The output format is a markdown table, so you can copy-paste it into your `README.md`.

### How it works

Benchmarks run on [PocketIC](https://github.com/dfinity/pocketic), which Mops downloads and manages itself — `dfx` is not involved and does not need to be installed. Pin a version with [`mops toolchain use pocket-ic 15.0.0`](../5-toolchain/03-mops-toolchain-use.md). There is no default: an unpinned project errors, unless [`MOPS_POCKET_IC_URL`](../7-misc/06-environment-variables.md#mops_pocket_ic_url) points at an already-running PocketIC server (Mops then attaches to it instead of spawning one, and an existing pin is ignored).

Under the hood, Mops will:
- Start a PocketIC server on an ephemeral port (or attach to the `MOPS_POCKET_IC_URL` server)
- Wrap each `*.bench.mo` file in a canister
- Compile canisters under enhanced orthogonal persistence (moc's default) and deploy them. Only the legacy GCs of `moc` 1.x are compiled with the `--force-gc` flag
- Before each cell, send empty update calls until no incremental GC cycle is in progress. While a cycle is in progress, the GC's write and allocation barriers are on, so a cell would cost more instructions depending on what ran before it
- Run each cell of the benchmark file as an update call (or a query call with [`--query`](#--query))
- For each call measure usage of wasm instructions(`performance_counter`) and heap growth(`rts_heap_size`). The GC does not run during the measurement, so heap growth is exactly what the call allocated. The Garbage Collection table, which would show 0, is not printed

:::caution Instruction counts depend on how the wasm was built

The number you get is for the exact wasm PocketIC runs, and nothing post-optimizes it on deploy:

- **With [`[optimize]`](../../09-mops.toml.md#optimize)** — `mops bench` runs `wasm-opt` on the module before deploy (same pass as `mops build`). Prefer this when you want bench numbers to match an optimized deploy artifact. Pass [`--no-optimize`](#--no-optimize) to skip the pass for a single run without editing `mops.toml`.
- **Without `[optimize]`** — PocketIC runs the raw `moc` output, with **no optimization**.

Always compare runs made with the same `moc` version, the same PocketIC version, and the same `[optimize]` settings. Different replicas report different instruction and heap counts, so baselines recorded before mops 3.0.0 on the `dfx` replica are not comparable — re-record them with [`--save`](#--save).

`[optimize]` requires a `[toolchain] wasm-opt` pin, and a `wasm-opt` failure fails the run. Use [`--verbose`](#--verbose) for full `wasm-opt` output.

:::

## Options

### `--gc`

Select garbage collector.

Possible values:
- `incremental` (default)
- `copying`
- `compacting`
- `generational`

Under enhanced orthogonal persistence (the default persistence mode), moc fixes the GC to `incremental` and the collector cannot be chosen — the other collectors only exist under legacy persistence. Selecting `copying`, `compacting`, or `generational` therefore implies [`--legacy-persistence`](#--legacy-persistence).

The other collectors are for `moc` 1.x only. `moc` 2.0.0 removes legacy persistence, so the incremental GC is the only one, and `mops bench` refuses `--gc copying`, `--gc compacting` and `--gc generational`.

### `--save`

Save benchmark results to `.bench/<filename>.json` file, such as `.bench/sort.bench.json` for `bench/sort.bench.mo`.

When several benchmark files share a name in different directories, each one is saved under its path from the project root instead, with `__` between directories: `bench/a/sort.bench.mo` saves to `.bench/bench__a__sort.bench.json`. So when you add a file whose name is already taken, rename the existing results file to match before you run `--compare`.

### `--compare`

Compare benchmark results with the results from `.bench/<filename>.json` file, named as in [`--save`](#--save).

### `--query`

Measure each cell in a **query** call instead of an update call.

This is how `query` methods execute on the IC. A cell's runner is a synchronous function, so the GC does not run during the measurement in either kind of call, and both report the same numbers.

### `--legacy-persistence`

Compile benchmark canisters under legacy persistence instead of enhanced orthogonal persistence (the default).

Use it to measure a canister that still uses legacy persistence. Has no effect with `moc < 0.15`, where legacy persistence is already the default. `moc` 2.0.0 removes legacy persistence, so `mops bench` refuses the flag with `moc` 2 pinned.

### `--no-optimize`

Skip the [`[optimize]`](../../09-mops.toml.md#optimize) `wasm-opt` pass for this run, even when it is configured in `mops.toml`. Has no effect when `[optimize]` is not set. PocketIC then runs the raw `moc` output.

```
mops bench --no-optimize
```

### `--verbose`

Print the benchmark pipeline up front — compiler version, replica + version, GC, context (query/update), persistence, profile, and whether the wasm is optimized — then log the full `moc` build command and stream the compiler and replica output instead of hiding it.

### `-- <moc flags>`

Pass extra flags directly to the Motoko compiler for this invocation. Appended after `[moc].args` from `mops.toml`.

```
mops bench -- -Werror
```

### `--locked`

Require an up-to-date [`mops.lock`](../../10-mops.lock.md) and never write it — fails if the lockfile is missing or no longer matches `mops.toml` and the registry. Intended for CI, so that a job can run this command without a preceding `mops install`. See [`mops install --locked`](../1-deps/02-mops-install.md#--locked).

