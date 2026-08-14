#!/bin/sh
# Container entrypoint for the check-deploy gVisor repro. VARIANT selects the
# workload (see README.md):
#   plain             mops build main --check-deploy on the registry canister
#   wasm-memory-limit same, with a 256 MiB wasmMemoryLimit on the canister
#   rounds            replica-mode mops test driving ~4800 execution rounds
#   probe             read 1 GiB of untouched anonymous memory, no writes
set -eu

case "${VARIANT:-plain}" in
  plain) ;;
  wasm-memory-limit)
    cp fixtures/mops-wasm-memory-limit.toml mops.toml
    ;;
  rounds)
    # Four replica test files, each deploying a fresh canister to the shared
    # PocketIC server and awaiting an empty self-call 150 times. Kept small
    # per ingress message because x86_64 runsc slows execution by an order of
    # magnitude and the PocketIC client times out on long-running ingress
    # calls; the point is round count, not per-round work.
    mkdir -p test
    for n in 1 2 3 4; do
      cat > "test/load$n.test.mo" <<'M'
// @testmode replica
persistent actor {
  public func tick() : async () {};
  public func runTests() : async () {
    var r = 0;
    while (r < 150) {
      await tick();
      r += 1;
    };
  };
};
M
    done
    ;;
  probe)
    # Zero-page probe: under runc the reads hit the shared zero page
    # and commit ~nothing; under gVisor every read commits a real page. The
    # runner samples the cgroup around the sleeps to isolate the read cost.
    exec node -e '
      const SZ = 1 << 30;
      const buf = Buffer.allocUnsafeSlow(SZ);
      setTimeout(() => {
        let s = 0;
        for (let i = 0; i < SZ; i += 4096) s += buf[i];
        setTimeout(() => { console.log("probe done, sum", s); }, 20000);
      }, 8000);
    '
    ;;
  *)
    echo "unknown VARIANT: ${VARIANT}" >&2
    exit 2
    ;;
esac

# In-container view: top RSS consumers every 2s. Under runc this is host
# truth; under gVisor it is the sentry's virtualized accounting, so treat it
# as attribution only — the host-side cgroup numbers in run.sh are the ground
# truth for the memory cap.
(
  while sleep 2; do
    echo "--- mem sample $(date -u +%H:%M:%S) ---"
    ps -eo rss=,comm= | sort -rn | head -4 | awk '{printf "%7.1f MiB  %s\n", $1/1024, $2}'
  done
) &

if [ "${VARIANT:-plain}" = rounds ]; then
  exec mops test
fi
exec mops build main --check-deploy
