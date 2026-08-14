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

It is necessary to use [bench package](https://mops.one/bench) to write benchmarks.

The output format is a markdown table, so you can copy-paste it into your `README.md`.

### How it works

Benchmarks run on [PocketIC](https://github.com/dfinity/pocketic), which Mops downloads and manages itself — `dfx` is not involved and does not need to be installed. Pin a version with [`mops toolchain use pocket-ic 15.0.0`](../5-toolchain/03-mops-toolchain-use.md). There is no default: an unpinned project errors.

Under the hood, Mops will:
- Start a PocketIC server on an ephemeral port
- Wrap each `*.bench.mo` file in a canister
- Compile canisters under enhanced orthogonal persistence (moc's default) with the `--force-gc` flag and deploy them
- Run each cell of the benchmark file as an update call (or a query call with [`--query`](#--query))
- For each call measure usage of wasm instructions(`performance_counter`) and heap size(`rts_heap_size`)

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

### `--save`

Save benchmark results to `.bench/<filename>.json` file.

### `--compare`

Compare benchmark results with the results from `.bench/<filename>.json` file.

### `--query`

Measure each cell in a **query** call instead of an update call.

This reflects how `query` methods actually execute on the IC: queries run no garbage collection, so the instruction counts exclude GC work that an update would incur. Use it to benchmark read-only/`query` workloads realistically.

Only works for benchmarks whose runner is **synchronous** — a runner that performs inter-canister (`await`) calls needs the update path and must be run without `--query`.

### `--legacy-persistence`

Compile benchmark canisters under legacy persistence instead of enhanced orthogonal persistence (the default).

Use it to measure a canister that still uses legacy persistence. Has no effect with `moc < 0.15`, where legacy persistence is already the default.

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

