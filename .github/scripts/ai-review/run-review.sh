#!/usr/bin/env bash
# Run the AI PR review: parallel find sweeps, then one judging pass.
#
# Why two waves: a single pass that both hunts for defects and decides whether to
# approve suppresses its own findings — it identifies bugs, then declines to
# report the ones it judges below the stated bar. The sweeps here are never shown
# the verdict rules; all filtering happens in the judge, which first has to try
# to refute what the sweeps found.
#
# Why only two waves: the earlier build fanned out one verifier per candidate,
# which cost 15 of 25 agent calls on its first real run and refuted nothing. The
# judge does that refutation in one pass instead, and dedupe stops being a
# separate expense once there are three sweeps rather than seven. Wall clock
# matters too: this check should not be the slowest thing on a PR.
#
# Agent calls: 3 sweeps + 1 judge on code, 1 sweep + 1 judge on prose-only diffs.
#
# Requires: BASE_SHA, HEAD_SHA, a checkout at HEAD_SHA, materialized context in
# $CONTEXT_DIR, and the Cursor CLI on PATH. Writes the final review to
# $OUTPUT_FILE and per-pass intermediates to $WORK_DIR.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

: "${BASE_SHA:?BASE_SHA is required}"
: "${HEAD_SHA:?HEAD_SHA is required}"
OUTPUT_FILE="${OUTPUT_FILE:-cursor-ai-review.md}"

[ -s "$CONTEXT_DIR/changed-files.txt" ] || {
  log "ERROR: $CONTEXT_DIR/changed-files.txt missing or empty; run materialize-context.sh first"
  exit 1
}

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR/findings"
write_agent_sandbox
resolve_agent_bin

PIPELINE_STARTED=$SECONDS

# --- Sweep selection ----------------------------------------------------------
#
# The prose set exists so a docs PR does not pay for the correctness and fit
# sweeps. Anything executable — including the shell and YAML under .github/,
# where this pipeline's own logic lives — gets the full set, because loops and
# boundary conditions are exactly what defects hide in.

ALL_SWEEPS="01-correctness 02-fit 03-risk"
PROSE_SWEEPS="03-risk"

if [ -n "${REVIEW_SWEEPS:-}" ]; then
  SWEEPS="$REVIEW_SWEEPS"
  log "sweeps: explicit ($SWEEPS)"
elif grep -qvE '^(docs|blog)/|^[^/]*\.md$|^[^/]*\.txt$' "$CONTEXT_DIR/changed-files.txt" > /dev/null; then
  SWEEPS="$ALL_SWEEPS"
  log "sweeps: full — the diff touches something outside docs/, blog/ and root prose"
else
  SWEEPS="$PROSE_SWEEPS"
  log "sweeps: prose — the diff is documentation only"
fi

# --- Wave 1: find (parallel) --------------------------------------------------

sweeps_attempted=0
for sweep in $SWEEPS; do
  sweep_prompt="$PROMPT_DIR/sweeps/${sweep}.md"
  if [ ! -s "$sweep_prompt" ]; then
    log "WARNING: sweep prompt $sweep_prompt not found; skipping"
    printf 'COVERAGE GAP: the %s sweep did not run (its prompt %s is missing), so nothing in this review was checked through it.\n' \
      "$sweep" "$sweep_prompt" > "$WORK_DIR/findings/${sweep}.gap"
    continue
  fi
  sweeps_attempted=$((sweeps_attempted + 1))

  prompt="$WORK_DIR/prompt-find-${sweep}.md"
  cat "$PROMPT_DIR/pr-review-context.md" "$PROMPT_DIR/pr-review-find.md" "$sweep_prompt" > "$prompt"
  append_pr_context "$prompt"
  # Only the risk sweep is told to read history, so only it pays for the digest.
  # History before the diff: append_diff spends whatever budget is left.
  case "$sweep" in
    03-risk) append_history "$prompt" ;;
  esac
  append_diff "$prompt"

  await_slot
  # A sweep that produces nothing usable writes its own coverage gap. Silence
  # would let the judge mark the category ✅ and approve.
  (run_agent "$prompt" "$WORK_DIR/findings/${sweep}.md" "find:${sweep}" || {
    log "find:${sweep}: no usable output — recording a coverage gap"
    printf 'COVERAGE GAP: the %s sweep failed to produce output, so nothing in this review was checked through it.\n' \
      "$sweep" > "$WORK_DIR/findings/${sweep}.gap"
  }) &
done
wait

# Success is the .model marker run_agent writes, not file size: a failed CLI can
# leave a partial dump behind, and treating that as output both hides the outage
# and feeds error text into the judge as candidates.
sweeps_ok=0
for sweep in $SWEEPS; do
  if agent_succeeded "$WORK_DIR/findings/${sweep}.md"; then
    sweeps_ok=$((sweeps_ok + 1))
  fi
done
sweeps_selected="$(echo "$SWEEPS" | wc -w | tr -d ' ')"
sweeps_failed=$((sweeps_selected - sweeps_ok))
log "sweeps completed: $sweeps_ok of $sweeps_selected selected ($sweeps_attempted attempted)"

if [ "$sweeps_ok" -eq 0 ]; then
  log "ERROR: every sweep failed; refusing to synthesize a review from nothing"
  exit 1
fi

: > "$WORK_DIR/candidates.md"
for sweep in $SWEEPS; do
  if agent_succeeded "$WORK_DIR/findings/${sweep}.md"; then
    cat "$WORK_DIR/findings/${sweep}.md" >> "$WORK_DIR/candidates.md"
  fi
done
candidate_count="$(grep -c '^=== FINDING ===' "$WORK_DIR/candidates.md" 2>/dev/null || true)"
candidate_count="${candidate_count:-0}"
log "candidates: $candidate_count"

{
  grep -h '^COVERAGE GAP:' "$WORK_DIR/findings/"*.md 2>/dev/null || true
  cat "$WORK_DIR/findings/"*.gap 2>/dev/null || true
} > "$WORK_DIR/coverage-gaps.txt"

# --- Wave 2: judge ------------------------------------------------------------

prompt="$WORK_DIR/prompt-judge.md"
cat "$PROMPT_DIR/pr-review-context.md" "$PROMPT_DIR/pr-review-judge.md" > "$prompt"
{
  printf '\n## Candidates from the sweeps\n\n'
  if [ "$candidate_count" -gt 0 ]; then
    cat "$WORK_DIR/candidates.md"
  else
    printf 'The sweeps reported no candidate defects.\n'
    printf 'Assess the categories from the diff and the checkout, and decide the verdict on that basis.\n'
  fi
  if [ -s "$WORK_DIR/coverage-gaps.txt" ]; then
    printf '\n## Coverage gaps reported by the sweeps\n\n'
    cat "$WORK_DIR/coverage-gaps.txt"
  fi
  if [ "$sweeps_failed" -gt 0 ]; then
    printf '\n## Incomplete sweep coverage\n\n'
    printf '%s of %s selected sweeps produced no output for this PR. The categories they cover were NOT checked: mark them ⚠️ and say so, and do not treat this review as complete evidence for an approval.\n' \
      "$sweeps_failed" "$sweeps_selected"
  fi
} >> "$prompt"
append_pr_context "$prompt"
append_diff "$prompt"

judge_out="$WORK_DIR/judge.md"
if ! run_agent "$prompt" "$judge_out" "judge"; then
  log "ERROR: judging pass failed"
  exit 1
fi

# The dispositions block records what happened to every candidate. It is kept for
# the artifact and stripped from the posted review — a reader wants the findings,
# not the bookkeeping.
awk '
  /^=== END DISPOSITIONS ===$/ && !seen { seen = 1; next }
  !seen && /^=== DISPOSITIONS ===$/ { next }
  !seen { print > dispositions; next }
  { print > review }
' dispositions="$WORK_DIR/dispositions.txt" review="$WORK_DIR/review-body.md" "$judge_out"

# No dispositions block at all: the whole output is the review.
if [ ! -s "$WORK_DIR/review-body.md" ]; then
  cp "$judge_out" "$WORK_DIR/review-body.md"
  : > "$WORK_DIR/dispositions.txt"
fi
sed -e '/./,$!d' "$WORK_DIR/review-body.md" > "$OUTPUT_FILE"

if [ ! -s "$OUTPUT_FILE" ]; then
  log "ERROR: the judging pass produced no review after stripping dispositions"
  exit 1
fi

confirmed="$(grep -c 'CONFIRMED' "$WORK_DIR/dispositions.txt" 2>/dev/null || true)"
plausible="$(grep -c 'PLAUSIBLE' "$WORK_DIR/dispositions.txt" 2>/dev/null || true)"
refuted="$(grep -c 'REFUTED' "$WORK_DIR/dispositions.txt" 2>/dev/null || true)"
log "dispositions: ${confirmed:-0} confirmed, ${plausible:-0} plausible, ${refuted:-0} refuted"

# --- Stats footer -------------------------------------------------------------

models_used="$(
  shopt -s nullglob
  cat "$WORK_DIR"/findings/*.model "$WORK_DIR"/*.model 2>/dev/null |
    tr ' ' '\n' | sort -u | tr '\n' ' ' | sed -E 's/ +$//' || true
)"
{
  printf 'sweeps=%s/%s\n' "$sweeps_ok" "$sweeps_selected"
  printf 'sweeps_failed=%s\n' "$sweeps_failed"
  printf 'agent_calls=%s\n' "$((sweeps_attempted + 1))"
  printf 'candidates=%s\n' "$candidate_count"
  printf 'confirmed=%s\n' "${confirmed:-0}"
  printf 'plausible=%s\n' "${plausible:-0}"
  printf 'refuted=%s\n' "${refuted:-0}"
  printf 'models=%s\n' "${models_used:-unknown}"
  printf 'seconds=%s\n' "$((SECONDS - PIPELINE_STARTED))"
} > "$WORK_DIR/review-stats.txt"

log "pipeline done in $((SECONDS - PIPELINE_STARTED))s"
cat "$WORK_DIR/review-stats.txt" >&2
