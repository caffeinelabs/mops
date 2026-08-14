# Last runs

Committed manually after each meaningful run — replace this file wholesale.
See README.md for the scenario definitions and how to reproduce.

## x86_64 — REPRODUCED

- **date**: 2026-08-14, [gvisor-repro workflow run 31784043015](https://github.com/caffeinelabs/mops/actions/runs/31784043015)
- **host**: GitHub `ubuntu-latest` (x86_64, 4 vCPU, 16 GiB), gVisor
  `release-latest` (systrap platform)
- **image**: ic-mops 2.22.0 · moc 0.14.14 (Linux-x86_64) · pocket-ic 15.0.0
- **caps**: `--memory 4g --memory-swap 4g`, 900s per-scenario harness timeout

| scenario | runtime | variant | mem cap | outcome | peak cgroup mem | wall time |
|---|---|---|---|---|---|---|
| probe-runc | `--runtime=runc` | probe | 4g | passed | 0.01 GiB (read cost **0.00 GiB**) | 28s |
| probe-runsc | `--runtime=runsc` | probe | 4g | passed | 1.04 GiB (read cost **1.00 GiB**) | 29s |
| deploy-runc | `--runtime=runc` | plain | 4g | passed | **0.64 GiB** | **17s** |
| deploy-runsc | `--runtime=runsc` | plain | 4g | killed by harness timeout, still running | **2.80 GiB and climbing** | 901s |
| deploy-runsc-limit | `--runtime=runsc` | wasm-memory-limit | 4g | killed by harness timeout, still running | **2.73 GiB and climbing** | 902s |
| rounds-runc | `--runtime=runc` | rounds | 4g | passed | 0.62 GiB | 8s |
| rounds-runsc | `--runtime=runsc` | rounds | 4g | failed (PocketIC client timeout) | 0.55 GiB | 43s |

(The run predates the harness's explicit timeout labeling — the two runsc
deploy rows were reported as `OOM-killed (exit 137)` because the harness's
own `docker kill` at 900s also exits 137. The log's "timeout after 900s —
killing container" lines are unambiguous. PR-triggered runs now use a 2 GiB
cap and a 1500s timeout so the kill is a true cgroup OOM.)

### Reading

- **This is the production failure mode.** The identical
  `mops build main --check-deploy` of the registry canister completes under
  runc in **17 seconds at 0.64 GiB** — and under runsc was **still executing
  after 15 minutes with 2.8 GiB committed and rising** when the harness
  killed it. The `--runtime` flag is the only difference. A container
  sharing its cap with other processes crosses the cgroup limit on that
  curve and is SIGKILLed — exit 137. The grind is a failure mode of its own:
  checks that do not OOM stall for tens of minutes.
- **`wasmMemoryLimit` does NOT prevent it**: 2.73 vs 2.80 GiB is noise. As
  the probe predicts, the memory is committed by replica-machinery *reads*
  (the canister sandbox's page tracking over the Wasm heap), not by what the
  canister allocates — no canister-level setting can bound it.
- **The probe pins the mechanism**: reading 1 GiB of untouched anonymous
  memory commits 0.00 GiB under runc and 1.00 GiB under runsc.
- rounds-runsc failing on a PocketIC client timeout is itself part of the
  finding: x86_64 runsc slows the replica by well over an order of
  magnitude, so client-side timeouts fire long before memory does.

## arm64 (Apple Silicon, local) — mechanism only

- **date**: 2026-08-14
- **host**: OrbStack Ubuntu noble machine on darwin arm64 (aarch64),
  kernel 7.0.11-orbstack, docker 29.1.3, gVisor `release-20260810.0`
  (systrap), 15 GiB VM memory
- **image**: ic-mops 2.22.0 · moc 0.14.14 (Linux-aarch64) · pocket-ic 15.0.0
  (arm64-linux)
- **caps**: `--memory 4g --memory-swap 4g`

| scenario | runtime | variant | mem cap | outcome | peak cgroup mem | wall time |
|---|---|---|---|---|---|---|
| probe-runc | `--runtime=runc` | probe | 4g | passed | 0.08 GiB (read cost **0.00 GiB**) | 28s |
| probe-runsc | `--runtime=runsc` | probe | 4g | passed | 1.03 GiB (read cost **1.00 GiB**) | 28s |
| deploy-runc | `--runtime=runc` | plain | 4g | passed | 0.71 GiB | 11s |
| deploy-runsc | `--runtime=runsc` | plain | 4g | passed | 0.71 GiB | 11s |
| deploy-runsc-limit | `--runtime=runsc` | wasm-memory-limit | 4g | passed | 0.85 GiB | 12s |
| rounds-runc | `--runtime=runc` | rounds | 4g | passed | 0.57 GiB | 4s |
| rounds-runsc | `--runtime=runsc` | rounds | 4g | passed | 0.62 GiB | 8s |

One-off side experiments on the same arm64 host:

| experiment | runc | runsc |
|---|---|---|
| check-deploy of **8** registry canisters in one run (one PocketIC server) | 0.86 GiB, passed | 0.90 GiB, passed |
| check-deploy of a minimal **moc 1.12 EOP/wasm64** canister | 0.55 GiB, passed | 0.68 GiB, passed |
| amd64 image under runsc on arm64 | — | `exec format error` (gVisor has no binfmt/Rosetta) |

### Reading

- The zero-page mechanism reproduces identically on arm64 (probe), but the
  workload blowup does not: runsc ≈ runc on every mops workload, everything
  passes in seconds. The x86_64 canister sandbox's memory tracking
  (SIGSEGV-driven PROT_READ window prefetch over the Wasm heap) evidently
  reads — and under gVisor commits — orders of magnitude more untouched
  memory than the aarch64 implementation, and is dramatically slower under
  runsc's syscall interception.
- Deploy/rounds peaks vary ±0.1 GiB between runs; treat sub-0.1 GiB deltas
  as noise.
