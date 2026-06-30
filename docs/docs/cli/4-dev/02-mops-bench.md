---
slug: /cli/mops-bench
sidebar_label: mops bench
---

# `mops bench`

Run Motoko benchmarks.

```
mops bench [filter]
```

Put your benchmark code in `bench/*.bench.mo` files.

It is necessary to use [bench package](https://mops.one/bench) to write benchmarks.

The output format is a markdown table, so you can copy-paste it into your `README.md`.

### How it works

Under the hood, Mops will:
- Start a local replica on port `4944`
- Wrap each `*.bench.mo` file in a canister
- Compile canisters under enhanced orthogonal persistence (moc's default) with the `--force-gc` flag and deploy them
- Run each cell of the benchmark file as an update call (or a query call with [`--query`](#--query))
- For each call measure usage of wasm instructions(`performance_counter`) and heap size(`rts_heap_size`)

:::caution Instruction counts depend on the replica

The number you get is for the exact wasm the chosen replica runs, and the two replicas install it differently:

- **`pocket-ic`** runs the raw `moc` output — **no optimization**.
- **`dfx`** post-optimizes the module before installing it (`optimize: "cycles"`, via `ic-wasm`), so its instruction counts can be meaningfully lower.

The same benchmark can therefore report different numbers across replicas. Always compare runs made with the **same replica**.

Also note that `dfx`'s optimization is best-effort: if it fails (for example, on wasm modules using features the bundled `ic-wasm` can't process, such as multi-value), `dfx` prints `WARNING: Failed to optimize the Wasm module` and falls back to the **unoptimized** module. Run with [`--verbose`](#--verbose) to see this warning.

:::

## Options

### `--replica`

Which replica to use.

Default `pocket-ic` if `pocket-ic` is specified in `mops.toml` in `[toolchain]` section, otherwise `dfx` (deprecated, see below).

Possible values:
- `pocket-ic` - use [PocketIC](https://github.com/dfinity/pocketic) light replica via [pic.js](https://github.com/dfinity/pic-js). Recommended.
- `dfx` - **deprecated**. Uses `dfx` local replica. Will be removed in a future release. Run `mops toolchain use pocket-ic 12.0.0` to pin a PocketIC version and `mops bench` will use it directly.

### `--gc`

Select garbage collector.

Possible values:
- `incremental` (default)
- `copying`
- `compacting`
- `generational`

Under enhanced orthogonal persistence (the default persistence mode), moc fixes the GC to `incremental` and the collector cannot be chosen — the other collectors only exist under legacy persistence. Selecting `copying`, `compacting`, or `generational` therefore implies [`--legacy-persistence`](#--legacy-persistence); pass `--gc incremental` (or omit `--gc`) to keep measuring under enhanced orthogonal persistence.

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

### `--verbose`

Print the benchmark pipeline up front — compiler version, replica + version, GC, profile, and whether the wasm is optimized — then log the full `moc` build command and stream the compiler and `dfx` output (including any deploy/optimization warnings) instead of hiding it.