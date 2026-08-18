#!/usr/bin/env bash
# Replay the AI review pipeline against a labelled case and score it against the
# defects a human found in that same diff.
#
# The point is to make prompt changes measurable: without this, "the review got
# better" is folklore. The case's code is checked out at its recorded head SHA in
# a throwaway worktree while the prompts and scripts come from the CURRENT
# checkout, so you are testing today's pipeline against yesterday's miss.
#
#   .github/prompts/eval/replay.sh                       # every case
#   .github/prompts/eval/replay.sh 772-single-pass-update # one case
#
# Requires: the Cursor CLI on PATH, CURSOR_API_KEY set, and the case's SHAs
# present locally (git fetch first if they are not). Each run costs real tokens.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
EVAL_DIR="$REPO_ROOT/.github/prompts/eval"
CASES_DIR="$EVAL_DIR/cases"
RESULTS_DIR="${RESULTS_DIR:-$EVAL_DIR/results}"

log() { printf '[eval] %s\n' "$*" >&2; }

field() { sed -nE "s/^[[:space:]]*$2:[[:space:]]*(.*)$/\1/p" "$1" | head -n 1; }

run_case() {
  local case_file="$1"
  local case_name
  case_name="$(basename "$case_file" .md)"

  local base_sha head_sha expected
  base_sha="$(field "$case_file" base_sha)"
  head_sha="$(field "$case_file" head_sha)"
  expected="$(field "$case_file" expected_verdict)"

  if [ -z "$base_sha" ] || [ -z "$head_sha" ]; then
    log "$case_name: missing base_sha or head_sha; skipping"
    return 1
  fi
  if ! git cat-file -e "${head_sha}^{commit}" 2>/dev/null || ! git cat-file -e "${base_sha}^{commit}" 2>/dev/null; then
    log "$case_name: base or head SHA not present locally — fetch the branch first; skipping"
    return 1
  fi

  local work_tree out_dir
  work_tree="$(mktemp -d)"
  out_dir="$RESULTS_DIR/$case_name"
  mkdir -p "$out_dir"
  # shellcheck disable=SC2064  # expand now: the trap must know this run's dir
  trap "git -C '$REPO_ROOT' worktree remove --force '$work_tree' >/dev/null 2>&1 || true" RETURN

  log "$case_name: checking out $head_sha in a throwaway worktree"
  git -C "$REPO_ROOT" worktree add --detach --quiet "$work_tree" "$head_sha"

  (
    cd "$work_tree"
    # CONTEXT_DIR and WORK_DIR stay relative: the agent sandbox allow-rules are
    # written against those exact relative paths. PROMPT_DIR is absolute on
    # purpose — the prompts under test are the current checkout's, not the
    # case's.
    export CONTEXT_DIR=".ai-review-context"
    export WORK_DIR=".ai-review-work"
    export PROMPT_DIR="$REPO_ROOT/.github/prompts"
    export OUTPUT_FILE="review.md"
    export BASE_SHA="$base_sha"
    export HEAD_SHA="$head_sha"
    export GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-}"
    export GH_TOKEN="${GH_TOKEN:-$(gh auth token 2>/dev/null || true)}"

    "$REPO_ROOT/.github/scripts/ai-review/materialize-context.sh"
    "$REPO_ROOT/.github/scripts/ai-review/run-review.sh"
  )

  cp -R "$work_tree/.ai-review-work" "$out_dir/work" 2>/dev/null || true
  cp "$work_tree/review.md" "$out_dir/review.md" 2>/dev/null || true

  score_case "$case_file" "$case_name" "$out_dir" "$expected"
}

score_case() {
  local case_file="$1" case_name="$2" out_dir="$3" expected="$4"
  local review="$out_dir/review.md"
  local candidates="$out_dir/candidates.txt"

  cat "$out_dir/work/findings/"*.md "$out_dir/work/triage.md" > "$candidates" 2>/dev/null || : > "$candidates"

  local total=0 reported=0 found=0
  printf '\n== %s ==\n' "$case_name"
  printf '%-32s %-10s %-10s\n' 'defect' 'candidate' 'reported'

  local defect pattern
  while IFS= read -r defect; do
    pattern="$(awk -v d="$defect" '
      $0 ~ "defect:[[:space:]]*"d"$" { grab = 1; next }
      grab && /^[[:space:]]*match:/ { sub(/^[[:space:]]*match:[[:space:]]*/, ""); print; exit }
    ' "$case_file")"
    [ -n "$pattern" ] || continue
    total=$((total + 1))

    local in_candidates='-' in_review='-'
    if grep -qiE -e "$pattern" "$candidates" 2>/dev/null; then
      in_candidates='HIT'
      found=$((found + 1))
    fi
    if grep -qiE -e "$pattern" "$review" 2>/dev/null; then
      in_review='HIT'
      reported=$((reported + 1))
    fi
    printf '%-32s %-10s %-10s\n' "$defect" "$in_candidates" "$in_review"
  done < <(sed -nE 's/^[[:space:]]*defect:[[:space:]]*(.*)$/\1/p' "$case_file")

  local decision
  decision="$(grep -m1 -E '^(\*\*Decision\*\*|Decision):' "$review" 2>/dev/null |
    sed -E 's/^(\*\*Decision\*\*|Decision):[[:space:]]*//' | tr -d '\r' | xargs || true)"

  printf '\nfound as candidate: %s/%s   reported in review: %s/%s\n' "$found" "$total" "$reported" "$total"
  printf 'decision: %s (expected %s)\n' "${decision:-none}" "${expected:-unspecified}"
  printf 'artifacts: %s\n' "$out_dir"

  # A defect that shows up as a candidate but not in the review is the synthesis
  # pass filtering out a real finding — a different problem from not finding it,
  # and worth separating in the output above.
  if [ "$found" -gt "$reported" ]; then
    printf 'note: %s defect(s) were found but did not survive into the posted review\n' "$((found - reported))"
  fi
}

mkdir -p "$RESULTS_DIR"

if [ "$#" -gt 0 ]; then
  for name in "$@"; do
    run_case "$CASES_DIR/${name%.md}.md"
  done
else
  shopt -s nullglob
  cases=("$CASES_DIR"/*.md)
  if [ "${#cases[@]}" -eq 0 ]; then
    log "no cases in $CASES_DIR"
    exit 1
  fi
  for case_file in "${cases[@]}"; do
    run_case "$case_file" || true
  done
fi
