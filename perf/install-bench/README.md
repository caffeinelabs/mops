# Install performance benchmark

Manual benchmark comparing the released **ic-mops v2** (from npm) against the
**v3 branch build** (this repo) on a project that depends on the whole caffeine
package ecosystem: `core`, every `caffeineai-*` component, every `*-client`
connector (`x-client`, `openai-client`, `googlemail-client`, …) and
`google-oauth` — 25 root dependencies, ~40 packages with transitives, ~28 MB
installed. It talks to the **live IC registry**, so results depend on your
network; medians over several iterations are reported.

Written for issue [#723](https://github.com/caffeinelabs/mops/issues/723)
item 31 (parallel installs) to measure before/after, but it benchmarks any
mops build.

## Scenarios

| scenario | cache | mops.lock | timed command |
|---|---|---|---|
| install-cold-nolock | empty | absent | `mops install` |
| install-cold-validlock | empty | matches mops.toml | `mops install` |
| install-cold-stalelock | empty | stale (built against an older pin) | `mops install` |
| install-warm-nolock | primed | absent | `mops install` |
| install-warm-validlock | primed | matches | `mops install` |
| install-warm-stalelock | primed | stale | `mops install` |
| add-two | primed | valid, project installed | `mops add map` + `mops add datetime` |
| update-few | primed | project installed from aged pins | `mops update core` + `google-oauth` + `googlemail-client` |
| update-all | primed | project installed from aged pins | `mops update` |

"Aged pins" (`fixtures/project-aged.toml`) hold 9 packages one release behind,
all within the caret bound, so `mops update` moves each of them. The stale
lock is generated from `fixtures/project-stale.toml` (one pin behind) and then
run against the full manifest. All installs pass `--no-toolchain`; toolchain
download is out of scope.

Every target gets its own cache and config via `XDG_CACHE_HOME` /
`XDG_CONFIG_HOME` (honored by both v2 and v3 on all platforms), so the run
never touches — and is never polluted by — your real mops cache. Cold
scenarios wipe that private cache before every iteration; warm scenarios
re-prime it through untimed side installs first.

## Run locally

Requires node ≥ 18 and network access to the IC. From the repo root:

```bash
node perf/install-bench/run.mjs
```

A full default run (2 targets × 9 scenarios × 3 iterations) downloads the
package set many times over — expect roughly an hour, dominated by the cold
installs. Useful options:

```bash
node perf/install-bench/run.mjs --iterations 1              # quick pass
node perf/install-bench/run.mjs --scenarios warm,add,update # skip cold installs
node perf/install-bench/run.mjs --targets v3                # single target
node perf/install-bench/run.mjs --out results.json          # keep raw numbers
```

The v3 target uses `cli/dist/bin/mops.js` and builds it if missing. The v2
target is installed from npm into the workdir (override with
`--v2-version 2.x.y`).

To benchmark another build (say, a branch in a second worktree), build its CLI
and add it as an extra target — the comparison column is computed against the
first target:

```bash
node perf/install-bench/run.mjs \
  --target v3-parallel=/path/to/other-worktree/cli/dist/bin/mops.js
```

## Run in Docker

Useful to sanity-check constrained environments (CPU/memory limits). The
image does not carry the Rust/wasm toolchain, so build the v3 CLI on the host
first; the Dockerfile copies `cli/dist` in and installs runtime deps with
scripts disabled. From the repo root:

```bash
cd cli && npm ci && npm run prepare && cd ..
docker build -f perf/install-bench/Dockerfile -t mops-install-bench .
docker run --rm mops-install-bench
docker run --rm --cpus 1 -m 512m mops-install-bench --iterations 1 --scenarios warm
```

Arguments after the image name are passed to `run.mjs`.

## Tracking runs

The most recent meaningful run is committed in [RESULTS.md](RESULTS.md) —
replace it wholesale when you re-run, and move the old headline numbers into
its history table. This is deliberately manual: runs are only comparable
within one host and network, so a committed run documents a point of
reference, not a CI gate.

## Reading the results

The script prints per-iteration times, then a markdown table of medians with a
ratio column (`v3 vs v2`, < 1.00x means the target is faster than the
baseline). Keep in mind the registry is live: versions resolved by `add`/
`update` move over time, and network jitter of a few hundred ms per query call
is normal, so treat small deltas as noise and re-run cold scenarios at least 3
times before drawing conclusions.
