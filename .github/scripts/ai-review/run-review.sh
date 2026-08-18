#!/usr/bin/env bash
# Run the AI PR review pipeline: find -> triage -> verify -> synthesize.
#
# Why four passes instead of one: a single pass that both hunts for defects and
# decides whether to approve suppresses its own findings. The finders here are
# told to report everything with a confidence and are never shown the verdict
# rules; filtering happens only in the synthesis pass, which sees findings that
# an independent pass already tried to refute.
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

# Verification is one agent call per candidate, so it is the pass that can run
# away on a large PR. Candidates arrive from triage in risk order, so a cap
# drops the least risky — and the drop is logged, never silent.
REVIEW_MAX_VERIFY="${REVIEW_MAX_VERIFY:-16}"

[ -s "$CONTEXT_DIR/changed-files.txt" ] || {
  log "ERROR: $CONTEXT_DIR/changed-files.txt missing or empty; run materialize-context.sh first"
  exit 1
}

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR/findings" "$WORK_DIR/candidates" "$WORK_DIR/verdicts"
write_agent_sandbox
resolve_agent_bin

PIPELINE_STARTED=$SECONDS

# --- Lens selection -----------------------------------------------------------
#
# A docs/CI-only PR does not need the input, state, parity and test lenses; the
# ones that stay are the ones that find defects in YAML, bash and prose.

ALL_LENSES="01-inputs 02-state 03-parity 04-wiring 05-history 06-tests 07-signals"
LIGHT_LENSES="04-wiring 05-history 07-signals"

if [ -n "${REVIEW_LENSES:-}" ]; then
  LENSES="$REVIEW_LENSES"
  log "lens set: explicit ($LENSES)"
elif grep -qE '^(cli|backend|frontend|cli-releases)/' "$CONTEXT_DIR/changed-files.txt"; then
  LENSES="$ALL_LENSES"
  log "lens set: full — the diff touches code"
else
  LENSES="$LIGHT_LENSES"
  log "lens set: light — the diff touches no code under cli/, backend/, frontend/ or cli-releases/"
fi

# --- Pass 1: find -------------------------------------------------------------

for lens in $LENSES; do
  lens_prompt="$PROMPT_DIR/lenses/${lens}.md"
  if [ ! -s "$lens_prompt" ]; then
    log "WARNING: lens prompt $lens_prompt not found; skipping"
    continue
  fi
  prompt="$WORK_DIR/prompt-find-${lens}.md"
  cat "$PROMPT_DIR/pr-review-context.md" "$PROMPT_DIR/pr-review-find.md" "$lens_prompt" > "$prompt"
  append_pr_context "$prompt"

  await_slot
  (run_agent "$prompt" "$WORK_DIR/findings/${lens}.md" "find:${lens}" ||
    log "find:${lens}: no usable output — this lens contributes a coverage gap") &
done
wait

finders_ok=0
for lens in $LENSES; do
  [ -s "$WORK_DIR/findings/${lens}.md" ] && finders_ok=$((finders_ok + 1))
done
log "finders completed: $finders_ok"

if [ "$finders_ok" -eq 0 ]; then
  log "ERROR: every finder failed; refusing to synthesize a review from nothing"
  exit 1
fi

cat "$WORK_DIR/findings/"*.md > "$WORK_DIR/candidates-raw.md" 2>/dev/null || true
raw_count="$(grep -c '^=== FINDING ===' "$WORK_DIR/candidates-raw.md" 2>/dev/null || true)"
raw_count="${raw_count:-0}"
log "raw candidates: $raw_count"

# --- Pass 2: triage (merge and deduplicate) -----------------------------------

candidate_count=0
if [ "$raw_count" -gt 0 ]; then
  prompt="$WORK_DIR/prompt-triage.md"
  cat "$PROMPT_DIR/pr-review-context.md" "$PROMPT_DIR/pr-review-triage.md" > "$prompt"
  {
    printf '\n## Candidate findings from the reviewers\n\n'
    cat "$WORK_DIR/candidates-raw.md"
  } >> "$prompt"
  append_pr_context "$prompt"

  if run_agent "$prompt" "$WORK_DIR/triage.md" "triage"; then
    candidate_count="$(split_blocks "$WORK_DIR/triage.md" '^=== FINDING ===' '^=== END FINDING ===' "$WORK_DIR/candidates" 'c')"
  else
    log "triage: failed — falling back to the raw candidate list"
    cp "$WORK_DIR/candidates-raw.md" "$WORK_DIR/triage.md"
    candidate_count="$(split_blocks "$WORK_DIR/triage.md" '^=== FINDING ===' '^=== END FINDING ===' "$WORK_DIR/candidates" 'c')"
  fi
fi
candidate_count="${candidate_count:-0}"
log "candidates after triage: $candidate_count"

# --- Pass 3: verify (adversarial, one agent per candidate) --------------------

verified=0
dropped_for_cap=0
if [ "$candidate_count" -gt 0 ]; then
  index=0
  for candidate in "$WORK_DIR/candidates/"c*.txt; do
    [ -s "$candidate" ] || continue
    index=$((index + 1))
    if [ "$index" -gt "$REVIEW_MAX_VERIFY" ]; then
      dropped_for_cap=$((dropped_for_cap + 1))
      continue
    fi
    name="$(basename "$candidate" .txt)"
    prompt="$WORK_DIR/prompt-verify-${name}.md"
    cat "$PROMPT_DIR/pr-review-context.md" "$PROMPT_DIR/pr-review-verify.md" > "$prompt"
    {
      printf '\n## The candidate to verify\n\n=== FINDING ===\n'
      cat "$candidate"
      printf '=== END FINDING ===\n'
    } >> "$prompt"
    append_pr_context "$prompt"

    await_slot
    (run_agent "$prompt" "$WORK_DIR/verdicts/${name}.md" "verify:${name}" ||
      log "verify:${name}: no usable output — the candidate carries through unverified") &
  done
  wait

  for candidate in "$WORK_DIR/candidates/"c*.txt; do
    [ -s "$WORK_DIR/verdicts/$(basename "$candidate" .txt).md" ] && verified=$((verified + 1))
  done
fi
if [ "$dropped_for_cap" -gt 0 ]; then
  log "WARNING: $dropped_for_cap candidate(s) past the REVIEW_MAX_VERIFY=$REVIEW_MAX_VERIFY cap were not verified"
fi
log "candidates verified: $verified"

# --- Assemble the verified list for synthesis --------------------------------
#
# Refuted candidates go into a short appendix rather than the main list: enough
# for a human reading the artifact to see what was considered and killed, not
# enough to invite the synthesis pass to resurrect them.

verified_input="$WORK_DIR/verified-findings.md"
: > "$verified_input"
confirmed=0
plausible=0
refuted=0
unverified=0
refuted_appendix="$WORK_DIR/refuted-appendix.md"
: > "$refuted_appendix"

for candidate in "$WORK_DIR/candidates/"c*.txt; do
  [ -s "$candidate" ] || continue
  name="$(basename "$candidate" .txt)"
  verdict_file="$WORK_DIR/verdicts/${name}.md"
  verdict="UNVERIFIED"
  if [ -s "$verdict_file" ]; then
    # Tolerate the model bolding the key; anything else degrades to UNVERIFIED,
    # which carries the candidate through as unproven rather than dropping it.
    verdict="$(grep -m1 -oE '^[[:space:]]*\**verdict\**:[[:space:]]*(CONFIRMED|PLAUSIBLE|REFUTED)' "$verdict_file" |
      grep -oE '(CONFIRMED|PLAUSIBLE|REFUTED)' || echo UNVERIFIED)"
  fi

  case "$verdict" in
    CONFIRMED) confirmed=$((confirmed + 1)) ;;
    PLAUSIBLE) plausible=$((plausible + 1)) ;;
    REFUTED)
      refuted=$((refuted + 1))
      {
        printf -- '- '
        grep -m2 -E '^[[:space:]]*(id|title):' "$candidate" | sed -E 's/^[[:space:]]*//' | tr '\n' ' '
        grep -m1 -E '^[[:space:]]*reason:' "$verdict_file" | sed -E 's/^[[:space:]]*//' || true
        printf '\n'
      } >> "$refuted_appendix"
      continue
      ;;
    *) unverified=$((unverified + 1)) ;;
  esac

  {
    printf '=== FINDING ===\n'
    cat "$candidate"
    printf '=== END FINDING ===\n'
    if [ -s "$verdict_file" ]; then
      printf '=== VERDICT ===\n'
      sed -e '/^=== VERDICT ===$/d' -e '/^=== END VERDICT ===$/d' "$verdict_file"
      printf '=== END VERDICT ===\n'
    else
      printf '=== VERDICT ===\nid: %s\nverdict: UNVERIFIED\nreason: the verification pass produced no output for this candidate; treat it as unproven.\n=== END VERDICT ===\n' "$name"
    fi
    printf '\n'
  } >> "$verified_input"
done

log "verdicts: $confirmed confirmed, $plausible plausible, $refuted refuted, $unverified unverified"

# --- Pass 4: synthesize the posted review ------------------------------------

prompt="$WORK_DIR/prompt-synthesize.md"
cat "$PROMPT_DIR/pr-review-context.md" "$PROMPT_DIR/pr-review-synthesize.md" > "$prompt"
{
  printf '\n## Verified findings\n\n'
  if [ -s "$verified_input" ]; then
    cat "$verified_input"
  else
    printf 'The reviewers reported no candidate defects that survived triage and verification.\n'
    printf 'Assess the categories from the diff and the checkout, and decide the verdict on that basis.\n'
  fi
  if [ -s "$refuted_appendix" ]; then
    printf '\n## Refuted candidates (do NOT report these)\n\n'
    cat "$refuted_appendix"
  fi
  # Coverage gaps drive the difference between a ✅ and a ⚠️ row, so they have to
  # reach the synthesis pass verbatim.
  if grep -h '^COVERAGE GAP:' "$WORK_DIR/findings/"*.md "$WORK_DIR/triage.md" > "$WORK_DIR/coverage-gaps.txt" 2>/dev/null &&
    [ -s "$WORK_DIR/coverage-gaps.txt" ]; then
    printf '\n## Coverage gaps reported by the reviewers\n\n'
    cat "$WORK_DIR/coverage-gaps.txt"
  fi
  if [ "$dropped_for_cap" -gt 0 ]; then
    printf '\n## Verification cap\n\n'
    printf '%s lower-risk candidate(s) were dropped unverified at the verification cap. Reflect that as a coverage limitation.\n' "$dropped_for_cap"
  fi
} >> "$prompt"
append_pr_context "$prompt"

if ! run_agent "$prompt" "$OUTPUT_FILE" "synthesize"; then
  log "ERROR: synthesis failed"
  exit 1
fi

# --- Stats footer -------------------------------------------------------------

models_used="$(cat "$WORK_DIR"/findings/*.model "$WORK_DIR"/*.model "$OUTPUT_FILE.model" 2>/dev/null |
  tr ' ' '\n' | sort -u | tr '\n' ' ' | sed -E 's/ +$//')"
{
  printf 'lenses=%s\n' "$(echo "$LENSES" | wc -w | tr -d ' ')"
  printf 'finders_ok=%s\n' "$finders_ok"
  printf 'raw_candidates=%s\n' "$raw_count"
  printf 'candidates=%s\n' "$candidate_count"
  printf 'confirmed=%s\n' "$confirmed"
  printf 'plausible=%s\n' "$plausible"
  printf 'refuted=%s\n' "$refuted"
  printf 'unverified=%s\n' "$unverified"
  printf 'unverified_at_cap=%s\n' "$dropped_for_cap"
  printf 'models=%s\n' "${models_used:-unknown}"
  printf 'seconds=%s\n' "$((SECONDS - PIPELINE_STARTED))"
} > "$WORK_DIR/review-stats.txt"

log "pipeline done in $((SECONDS - PIPELINE_STARTED))s"
cat "$WORK_DIR/review-stats.txt" >&2
