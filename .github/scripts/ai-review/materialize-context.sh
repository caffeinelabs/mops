#!/usr/bin/env bash
# Materialize everything the review agents need into $CONTEXT_DIR.
#
# The agents run with Shell(*) and Read(.git/**) denied, so anything that would
# normally come from `git`/`gh` has to be written to disk here, where the
# workflow still has a full checkout and a token. Keeping the sandbox closed and
# moving the privileged work into this script is deliberate.
#
# Requires: BASE_SHA, HEAD_SHA. Optional: GITHUB_EVENT_PATH (PR title/body),
# GITHUB_REPOSITORY + GH_TOKEN (prior review comments).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

: "${BASE_SHA:?BASE_SHA is required}"
: "${HEAD_SHA:?HEAD_SHA is required}"

# Keep the context small enough to stay readable and cheap to attach.
MAX_HISTORY_COMMITS="${MAX_HISTORY_COMMITS:-40}"
MAX_HISTORY_PATHS="${MAX_HISTORY_PATHS:-100}"
MAX_BLAME_FILES="${MAX_BLAME_FILES:-25}"
MAX_BLAME_RANGES="${MAX_BLAME_RANGES:-8}"
MAX_BLAME_LINES="${MAX_BLAME_LINES:-400}"
MAX_PRIOR_PRS="${MAX_PRIOR_PRS:-5}"
MAX_PRIOR_COMMENTS="${MAX_PRIOR_COMMENTS:-60}"
MAX_BLAME_BLOB_BYTES="${MAX_BLAME_BLOB_BYTES:-524288}"

rm -rf "$CONTEXT_DIR"
mkdir -p "$CONTEXT_DIR/file-diffs" "$CONTEXT_DIR/history/blame"

# NUL-delimited paths are robust against names with newlines/quotes/tabs.
git diff -z --name-only --no-color "$BASE_SHA...$HEAD_SHA" > "$CONTEXT_DIR/changed-files.z"
tr '\0' '\n' < "$CONTEXT_DIR/changed-files.z" > "$CONTEXT_DIR/changed-files.txt"
git diff --stat --no-color "$BASE_SHA...$HEAD_SHA" > "$CONTEXT_DIR/diff-stat.txt"

if [ -n "${GITHUB_EVENT_PATH:-}" ] && [ -s "${GITHUB_EVENT_PATH:-}" ] && command -v jq >/dev/null 2>&1; then
  jq -r '.pull_request.title // ""' "$GITHUB_EVENT_PATH" > "$CONTEXT_DIR/pr-title.txt"
  jq -r '.pull_request.body // ""' "$GITHUB_EVENT_PATH" > "$CONTEXT_DIR/pr-body.md"
else
  # Local / eval runs have no PR event: the head commit is the stated intent.
  git log -1 --format=%s "$HEAD_SHA" > "$CONTEXT_DIR/pr-title.txt"
  git log -1 --format=%b "$HEAD_SHA" > "$CONTEXT_DIR/pr-body.md"
fi

: > "$CONTEXT_DIR/file-diffs/manifest.txt"
while IFS= read -r -d '' file; do
  [ -n "$file" ] || continue
  patch_path="$CONTEXT_DIR/file-diffs/${file}.patch"
  mkdir -p "$(dirname "$patch_path")"
  git diff --no-color "$BASE_SHA...$HEAD_SHA" -- "$file" > "$patch_path"
  printf '%s\0%s\0' "$file" "$patch_path" >> "$CONTEXT_DIR/file-diffs/manifest.txt"
done < "$CONTEXT_DIR/changed-files.z"

changed_count="$(tr -cd '\0' < "$CONTEXT_DIR/changed-files.z" | wc -c | tr -d ' ')"
log "materialized $changed_count changed file patches"

# --- History: recent commits touching the changed files, before the PR --------

# Passed as one argv list rather than through xargs: xargs would split a very
# large file list into several git log runs, each with its own -n cap, and the
# output would silently exceed MAX_HISTORY_COMMITS.
history_paths=()
while IFS= read -r -d '' file; do
  [ -n "$file" ] || continue
  history_paths+=("$file")
  [ "${#history_paths[@]}" -lt "$MAX_HISTORY_PATHS" ] || break
done < "$CONTEXT_DIR/changed-files.z"

{
  printf '# Recent commits touching the changed files (before this PR, newest first)\n\n'
  if [ "${#history_paths[@]}" -gt 0 ]; then
    git log --no-merges -n "$MAX_HISTORY_COMMITS" \
      --format='%h %ad %an%n    %s' --date=short "$BASE_SHA" -- "${history_paths[@]}" \
      2>/dev/null || printf '(unavailable)\n'
  else
    printf '(no changed files)\n'
  fi
} > "$CONTEXT_DIR/history/commits.txt"

# --- History: blame for the lines this PR touches -----------------------------
#
# Blame the OLD line ranges at the base commit: that is who last touched the
# code being modified, and why. Files the PR adds have no base side and are
# skipped.

blamed=0
while IFS= read -r -d '' file; do
  [ -n "$file" ] || continue
  [ "$blamed" -lt "$MAX_BLAME_FILES" ] || break
  git cat-file -e "$BASE_SHA:$file" 2>/dev/null || continue
  blob_size="$(git cat-file -s "$BASE_SHA:$file" 2>/dev/null || echo 0)"
  [ "$blob_size" -le "$MAX_BLAME_BLOB_BYTES" ] || continue

  patch_path="$CONTEXT_DIR/file-diffs/${file}.patch"
  [ -s "$patch_path" ] || continue

  # "@@ -12,7 +12,9 @@" -> "-L 12,+7". A missing count means one line; a zero
  # start means the hunk has no base side.
  mapfile -t ranges < <(
    grep -oE '^@@ -[0-9]+(,[0-9]+)?' "$patch_path" 2>/dev/null |
      sed -E 's/^@@ -//' |
      awk -F, -v max="$MAX_BLAME_RANGES" '
        { start = $1; count = (NF > 1 ? $2 : 1) }
        start == 0 || count == 0 { next }
        ++n <= max { printf "%d,+%d\n", start, count }
      '
  )
  [ "${#ranges[@]}" -gt 0 ] || continue

  args=()
  for range in "${ranges[@]}"; do
    args+=(-L "$range")
  done

  blame_path="$CONTEXT_DIR/history/blame/${file}.blame"
  mkdir -p "$(dirname "$blame_path")"
  if git blame --date=short "${args[@]}" "$BASE_SHA" -- "$file" 2>/dev/null |
    head -n "$MAX_BLAME_LINES" > "$blame_path"; then
    if [ -s "$blame_path" ]; then
      blamed=$((blamed + 1))
    else
      rm -f "$blame_path"
    fi
  else
    rm -f "$blame_path"
  fi
done < "$CONTEXT_DIR/changed-files.z"
log "materialized blame for $blamed files"

# --- History: review comments on earlier PRs that touched these files ---------
#
# The repository is squash-only, so every merge leaves its PR number in the
# commit subject as "(#123)". That makes the PR list exact without a search API
# call. Bot and service-account authors are filtered out: this workflow's own
# automated reviews are the bulk of the review history, and feeding a reviewer
# its own prior output is noise at best and self-reinforcing at worst.
# Best-effort: no token, no gh, or an API hiccup degrades to a note.

COMMENT_AUTHOR_DENY="${COMMENT_AUTHOR_DENY:-automation-sa-sre,caffeine-ci-bot}"

fetch_pr_comments() {
  local pr="$1" endpoint="$2" kind="$3"
  gh api "repos/${GITHUB_REPOSITORY}/pulls/${pr}/${endpoint}" --paginate 2>/dev/null |
    jq -r --arg deny "$COMMENT_AUTHOR_DENY" --arg kind "$kind" '
      ($deny | split(",")) as $d
      | .[]
      | select((.body // "") != "")
      | select(.user.login as $l | ($d | index($l)) == null)
      | select((.user.login // "") | endswith("[bot]") | not)
      | select(.body | test("cursor-ai-review") | not)
      | "- \($kind) `\(.path // "-"):\(.line // .original_line // 0)` — \(.user.login): \(.body | gsub("[\r\n]+"; " ") | .[0:600])"
    '
}

prior_out="$CONTEXT_DIR/history/prior-review-comments.md"
{
  printf '# Human review comments on earlier merged PRs touching these files\n\n'
  printf 'Automated reviews are excluded. An empty section means no human left review feedback there.\n\n'
  if ! command -v gh >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1 ||
    [ -z "${GITHUB_REPOSITORY:-}" ] || [ -z "${GH_TOKEN:-}" ]; then
    printf '(unavailable: gh CLI, jq, GITHUB_REPOSITORY or GH_TOKEN missing)\n'
  else
    pr_numbers="$(grep -oE '\(#[0-9]+\)' "$CONTEXT_DIR/history/commits.txt" 2>/dev/null |
      tr -d '(#)' | awk '!seen[$0]++' | head -n "$MAX_PRIOR_PRS" || true)"
    if [ -z "$pr_numbers" ]; then
      printf '(no earlier PR numbers found in the commit history for these files)\n'
    else
      total=0
      for pr in $pr_numbers; do
        body="$(
          {
            fetch_pr_comments "$pr" comments inline
            fetch_pr_comments "$pr" reviews review
          } | head -n "$MAX_PRIOR_COMMENTS"
        )"
        if [ -n "$body" ]; then
          printf '## PR #%s\n\n%s\n\n' "$pr" "$body"
          total=$((total + 1))
        fi
      done
      if [ "$total" -eq 0 ]; then
        printf '(checked PRs %s — no human review comments found)\n' "$(echo "$pr_numbers" | tr '\n' ' ')"
      fi
    fi
  fi
} > "$prior_out"
log "materialized prior review comments ($(wc -l < "$prior_out" | tr -d ' ') lines)"
