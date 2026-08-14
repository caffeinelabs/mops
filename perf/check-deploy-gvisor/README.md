# check-deploy under gVisor: memory repro

Manual reproduction harness for a production failure mode: containers
running PocketIC workloads under gVisor (`--runtime=runsc`) with a hard
memory cap get OOM-killed (exit 137), while identical workloads under the
default runtime (`runc`) fit comfortably. The deployment workload is a
**real production canister** — `backend/main/main-canister.mo`, the mops.one
registry canister, built with the repo's own dependency set — deployed to
PocketIC exactly the way `mops build --check-deploy` does it (shipped in
mops 2.21.0).

The most recent run is committed in [RESULTS.md](RESULTS.md) — replace it
wholesale when you re-run, like `perf/install-bench` does on the v3 branch.

## Why this happens (mechanism)

Linux satisfies the first **read** of a never-written anonymous page from a
single shared zero page — committing no RAM. The IC's canister sandbox is
designed around that guarantee: it reserves a multi-GiB Wasm heap per
canister, and its SIGSEGV memory tracker, GC scans, and per-round dirty-page
validation **read** across that space assuming reads are free.

gVisor (`runsc`) reimplements the kernel's memory management **without a
shared zero page**: the first read of an anonymous page commits a real,
private, zeroed page, charged to the container's cgroup and not released
while the process lives. Every page the replica machinery merely glances at
becomes committed RAM. With `memory-swap == memory` (no swap, a common
sandbox configuration) crossing the cap is an instant SIGKILL.

The `probe` scenario demonstrates the mechanism in isolation: it reads 1 GiB
of untouched anonymous memory without writing. Under runc that commits a few
MiB of page tables; under runsc it commits the full 1 GiB.

## Scenarios

All scenarios run the same image with the same hard cap
(`--memory 4g --memory-swap 4g` by default). Everything network-dependent
(mops 2.22.0, moc, the pocket-ic binary, the installed dependency set) is
baked into the image at build time, so the measured runs are offline and
self-contained.

| scenario | runtime | workload |
|---|---|---|
| probe-runc / probe-runsc | both | read 1 GiB untouched anonymous memory (culprit demonstration) |
| deploy-runc / deploy-runsc | both | `mops build main --check-deploy` on the registry canister ([fixtures/mops.toml](fixtures/mops.toml)) |
| deploy-runsc-limit | runsc | same, with `wasmMemoryLimit = 256 MiB` on the canister ([fixtures/mops-wasm-memory-limit.toml](fixtures/mops-wasm-memory-limit.toml)) |
| deploy-eop-runc / deploy-eop-runsc | both | `mops build main --check-deploy` on an **EOP/wasm64** canister (moc 1.12, `persistent actor` + mo:core — [fixtures/eop](fixtures/eop)); the registry canister predates moc 1.x, so this variant uses a compact representative backend instead |
| rounds-runc / rounds-runsc | both | replica-mode `mops test`: 4 canisters × 150 awaited self-calls on one PocketIC server |

## Requirements

- A Linux host (x86_64 or arm64) with docker and [gVisor](https://gvisor.dev)
  installed, with `runsc` registered as a docker runtime:

  ```bash
  arch=$(uname -m)
  url=https://storage.googleapis.com/gvisor/releases/release/latest/${arch}
  sudo curl -fsSL -o /usr/local/bin/runsc ${url}/runsc
  sudo curl -fsSL -o /usr/local/bin/containerd-shim-runsc-v1 ${url}/containerd-shim-runsc-v1
  sudo chmod +x /usr/local/bin/runsc /usr/local/bin/containerd-shim-runsc-v1
  echo '{"runtimes":{"runsc":{"path":"/usr/local/bin/runsc"}}}' | sudo tee /etc/docker/daemon.json
  sudo systemctl restart docker
  ```

- ≥ 6 GiB of memory available to docker.

On a Mac, an [OrbStack](https://orbstack.dev) Linux machine works
(`orb create ubuntu:noble <name>`, then the steps above inside it). OrbStack's
own docker engine only ships runc. Note this gives you an **arm64** run —
see the caveat below.

## Run

From the repo root (or anywhere — the script cd's itself):

```bash
perf/check-deploy-gvisor/run.sh
```

Options:

```bash
perf/check-deploy-gvisor/run.sh --memory 2g          # tighter cap
perf/check-deploy-gvisor/run.sh --scenarios probe-runc,probe-runsc --no-build
perf/check-deploy-gvisor/run.sh --timeout 1200
```

The script builds the image (BuildKit required — it uses a per-Dockerfile
dockerignore), runs each scenario, samples the container's **host-side
cgroup accounting** (`memory.peak` / `memory.current` — the numbers the OOM
killer acts on) once a second, and prints a markdown table to paste into
RESULTS.md. For the probe scenarios it additionally reports the **read
cost**: committed memory after the read pass minus committed memory before
it. The container also logs its own top-RSS processes every 2 s for
attribution; under runsc that in-container view is the sentry's virtualized
accounting and understates the host commit — trust the host-side column.

## Interpreting results, and the x86_64 caveat

- The **probe pair is the culprit demonstration**: identical binary,
  identical read-only workload — a few MiB committed under runc, ~1 GiB
  under runsc. That is the docker `--runtime` setting turning free reads
  into committed RAM.
- **Architecture matters for the workload scenarios — the blowup is
  x86_64-specific.** On x86_64 (see RESULTS.md) the runsc deploy scenario
  reproduces it: the check that runc finishes in ~17 s at 0.64 GiB grinds
  for 15+ minutes committing multiple GiB. On arm64 the same workloads stay
  under 1 GiB with runsc ≈ runc: the aarch64 canister sandbox evidently
  reads far less untouched memory than the x86_64 one (SIGSEGV-driven
  PROT_READ window prefetch over the Wasm heap). An x86_64 image cannot be
  emulated on an arm64 host for this purpose — gVisor has no binfmt/Rosetta
  support (`exec format error`) — use the **`gvisor-repro` GitHub
  workflow**, which runs this harness on an x86_64 runner (auto on PRs
  touching the harness, manual via workflow_dispatch).
- **deploy-runsc-limit** answers whether `[canisters.<name>].wasmMemoryLimit`
  bounds the commit: it does not (x86_64: 2.73 vs 2.80 GiB — noise). As the
  probe implies, the commit is driven by replica-machinery reads, not by
  what the canister allocates, so no canister-level setting can bound it.

## Portability notes

- The image fetches moc and pocket-ic directly instead of via
  `mops toolchain`, because mops 2.x only downloads x86_64 Linux builds of
  both; the fixtures pin each as a `[toolchain]` **binary path**, a supported
  mops 2.x mechanism (`mops build` ignores `DFX_MOC_PATH` — its moc
  resolution is pin-or-`dfx cache show`).
- mops is pinned to **2.22.0**; `--check-deploy` landed in 2.21.0 and its
  deployment path is unchanged through 2.23.0, so any contemporary 2.x
  release measures the same behavior.
- moc is **0.14.14** (the repo's pin) building a **wasm32** canister.
  Projects on moc 1.x build under enhanced orthogonal persistence (wasm64);
  a one-off EOP variant measured on arm64 showed the same order of
  magnitude (see RESULTS.md).
