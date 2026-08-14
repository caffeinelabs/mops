#!/usr/bin/env bash
# Host-side runner for the check-deploy gVisor OOM repro (see README.md).
# Runs identical containerized workloads under runc and under gVisor (runsc)
# with identical hard memory caps, tracks the container's cgroup memory from
# the host, and prints a markdown results table.
#
# Requires a Linux host with docker and the runsc runtime configured (see
# README.md). Run from anywhere:
#   perf/check-deploy-gvisor/run.sh [--memory 4g] [--timeout 900]
#     [--scenarios probe-runc,probe-runsc,...] [--no-build]
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

IMAGE=mops-check-deploy-gvisor
MEMORY=4g
TIMEOUT=900
SCENARIOS=probe-runc,probe-runsc,deploy-runc,deploy-runsc,deploy-runsc-limit,deploy-eop-runc,deploy-eop-runsc,rounds-runc,rounds-runsc
BUILD=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --memory) MEMORY=$2; shift 2 ;;
    --timeout) TIMEOUT=$2; shift 2 ;;
    --scenarios) SCENARIOS=$2; shift 2 ;;
    --image) IMAGE=$2; shift 2 ;;
    --no-build) BUILD=0; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

if [[ $BUILD -eq 1 ]]; then
  # BuildKit is required for the per-Dockerfile dockerignore, which keeps the
  # build context to backend/ + fixtures instead of the whole repo.
  DOCKER_BUILDKIT=1 docker build -f perf/check-deploy-gvisor/Dockerfile -t "$IMAGE" .
fi

# The container's cgroup file, read from the host — the accounting the OOM
# killer acts on. Handles both the systemd and cgroupfs driver layouts.
cgroup_file() {
  local cid=$1 name=$2 f
  for f in \
    "/sys/fs/cgroup/system.slice/docker-${cid}.scope/$name" \
    "/sys/fs/cgroup/docker/${cid}/$name"; do
    [[ -r $f ]] && { echo "$f"; return; }
  done
  echo ""
}

gib() { awk -v b="${1:-0}" 'BEGIN{printf "%.2f GiB", b/1073741824}'; }

declare -a ROWS

run_scenario() {
  local name=$1 runtime=$2 variant=$3
  local cname="check-deploy-gvisor-$name"
  echo
  echo "=== scenario $name: --runtime=$runtime, VARIANT=$variant, --memory=$MEMORY (swap=mem) ==="
  docker rm -f "$cname" >/dev/null 2>&1 || true
  local cid
  cid=$(docker run -d --name "$cname" \
    --runtime "$runtime" \
    --memory "$MEMORY" --memory-swap "$MEMORY" \
    -e "VARIANT=$variant" \
    "$IMAGE")

  local peakf currentf start now peak="" pre_read="" timed_out=0
  peakf=$(cgroup_file "$cid" memory.peak)
  currentf=$(cgroup_file "$cid" memory.current)
  start=$(date +%s)
  while :; do
    [[ -n $peakf ]] && peak=$(cat "$peakf" 2>/dev/null || echo "$peak")
    now=$(date +%s)
    # probe: memory committed after alloc but before the reads begin at t=8s
    if [[ $variant == probe && -z $pre_read && $((now - start)) -ge 6 ]]; then
      pre_read=$(cat "$currentf" 2>/dev/null || echo "")
    fi
    # growth curve for the log, one point a minute
    if (( (now - start) % 60 == 0 && now - start > 0 )); then
      echo "  [$((now - start))s] committed $(gib "$(cat "$currentf" 2>/dev/null || echo 0)")"
    fi
    if [[ $(docker inspect -f '{{.State.Running}}' "$cid") != true ]]; then
      break
    fi
    if (( now - start > TIMEOUT )); then
      echo "timeout after ${TIMEOUT}s — killing container" >&2
      timed_out=1
      docker kill "$cid" >/dev/null || true
      break
    fi
    sleep 1
  done
  local elapsed=$(( $(date +%s) - start ))

  local exit_code oom outcome
  exit_code=$(docker inspect -f '{{.State.ExitCode}}' "$cid")
  oom=$(docker inspect -f '{{.State.OOMKilled}}' "$cid")
  # gVisor kills the whole sandbox on a cgroup OOM and docker sometimes
  # reports that as exit 137 without setting OOMKilled, so 137 counts as OOM
  # — unless the kill was ours (harness timeout with the workload still
  # running and committing).
  if [[ $exit_code == 0 ]]; then outcome="passed"
  elif [[ $timed_out == 1 ]]; then outcome="harness timeout at ${TIMEOUT}s, still running"
  elif [[ $oom == true || $exit_code == 137 ]]; then outcome="OOM-killed (exit $exit_code)"
  else outcome="failed (exit $exit_code)"
  fi

  local peak_h="n/a"
  [[ -n $peak ]] && peak_h=$(gib "$peak")
  if [[ $variant == probe && -n $pre_read && -n $peak ]]; then
    peak_h="$peak_h (read cost $(gib $((peak - pre_read))))"
  fi

  echo "--- last container output ---"
  docker logs --tail 15 "$cname" 2>&1 | sed 's/^/    /'
  echo "outcome=$outcome peak=$peak_h elapsed=${elapsed}s"
  ROWS+=("| $name | \`--runtime=$runtime\` | $variant | $MEMORY | $outcome | $peak_h | ${elapsed}s |")
  docker rm -f "$cname" >/dev/null 2>&1 || true
}

[[ ",$SCENARIOS," == *,probe-runc,* ]] && run_scenario probe-runc runc probe
[[ ",$SCENARIOS," == *,probe-runsc,* ]] && run_scenario probe-runsc runsc probe
[[ ",$SCENARIOS," == *,deploy-runc,* ]] && run_scenario deploy-runc runc plain
[[ ",$SCENARIOS," == *,deploy-runsc,* ]] && run_scenario deploy-runsc runsc plain
[[ ",$SCENARIOS," == *,deploy-runsc-limit,* ]] && run_scenario deploy-runsc-limit runsc wasm-memory-limit
[[ ",$SCENARIOS," == *,deploy-eop-runc,* ]] && run_scenario deploy-eop-runc runc eop
[[ ",$SCENARIOS," == *,deploy-eop-runsc,* ]] && run_scenario deploy-eop-runsc runsc eop
[[ ",$SCENARIOS," == *,rounds-runc,* ]] && run_scenario rounds-runc runc rounds
[[ ",$SCENARIOS," == *,rounds-runsc,* ]] && run_scenario rounds-runsc runsc rounds

echo
echo "| scenario | runtime | variant | mem cap | outcome | peak cgroup mem | wall time |"
echo "|---|---|---|---|---|---|---|"
printf '%s\n' "${ROWS[@]}"
