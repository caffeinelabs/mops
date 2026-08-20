# Last run

Committed manually after each meaningful run — replace this file wholesale.
See README.md for the scenario definitions and how to reproduce.

- **date**: 2026-08-13
- **targets**: v2 = `ic-mops@2.22.0` (npm) · v3 = `cli/dist` at `f8c619cc`
  (includes #741 sorted lock keys, #742 update alignment, #743 resolve memo,
  #744 this harness, #745 parallel installs, #746 in-flight resolve re-check)
- **host**: darwin arm64, 12 CPUs (v3 request budget resolves to 16), node
  v22.22.0, residential network to the live IC registry
- **project**: 25 caffeine root deps; v2 installs 42 packages, v3 installs 40
  (winning-closure only, #735)

## Medians of 3

| scenario | v2 | v3 | v3 vs v2 |
| --- | --- | --- | --- |
| install-cold-nolock | 139.6s | 107.4s | 0.77x |
| install-cold-validlock | 106.6s | 61.1s | 0.57x |
| install-cold-stalelock | 128.0s | 95.7s | 0.75x |
| install-warm-nolock | 3.20s | 5.62s | 1.76x † |
| install-warm-validlock | 6.20s | 2.99s | 0.48x † |
| install-warm-stalelock | 3.31s | 2.45s | 0.74x |
| add-two | 4.00s | 3.84s | 0.96x |
| update-few | 8.02s | 5.42s | 0.68x |
| update-all | 14.9s | 2.87s | 0.19x |

† The warm rows of the main run landed in a slow registry-latency window —
v2's own warm-validlock tripled against every prior run of the same binary,
which rules out a code cause. A warm-only re-run half an hour later, same
host and builds, came back in line with all earlier measurements:

| scenario (re-check) | v2 | v3 | v3 vs v2 |
| --- | --- | --- | --- |
| install-warm-nolock | 3.12s | 2.33s | 0.75x |
| install-warm-validlock | 2.56s | 1.08s | 0.42x |
| install-warm-stalelock | 2.69s | 2.11s | 0.79x |

Treat the re-check as the representative warm numbers; the main table is kept
unedited because cold scenarios (minutes, dozens of round-trips averaged out)
are far less sensitive to a bad window than warm ones (seconds, a handful of
round-trips).

## Reading

- v3 beats released v2 in **every** scenario. The cold no-lock install —
  v3's one regression before parallel installs (1.23–1.25x in the pre-#745
  baselines) — is now 0.77x.
- CI-shaped installs benefit most: cold with a committed lock is **43%
  faster** than v2, and a warm `mops install --locked`-style run is ~0.4x.
- `update-all` stays the headline: 14.9s → 2.87s (0.19x).

## History

| date | v3 commit | cold-nolock v2 / v3 | notes |
| --- | --- | --- | --- |
| 2026-08-13 | `f8c619cc` | 139.6s / 107.4s | this file; first tracked run |
| 2026-08-13 | `487a34e3` + #745 build | 124.0s / 107.3s | 3-way run on [#745](https://github.com/caffeinelabs/mops/pull/745#issuecomment-5273205275) |
| 2026-08-12 | `487a34e3` | 131.6s / 162.1s | pre-#745 baseline on [#744](https://github.com/caffeinelabs/mops/pull/744#issuecomment-5272583909) |
