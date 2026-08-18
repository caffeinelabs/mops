# Your task: merge and deduplicate the candidate findings

Several independent reviewers each worked one lens over this PR. Their raw candidate findings are appended
below. Your job is to turn them into one clean list. You are NOT a filter for importance.

## Rules

1. **Merge duplicates.** Two candidates are the same finding when they describe the same defect at the same
   place, even when the titles, wording, or line numbers differ, and even when they came from different
   lenses. Keep the clearest statement of the two, union their `files`, keep the **highest** confidence, and
   list every contributing id in `merged_from`.
2. **Do not merge distinct defects that happen to share a line.** Two different things wrong with the same
   function are two findings.
3. **Keep everything else.** Carry through every candidate that is not a duplicate, at the confidence its
   reporter gave it. You may lower a confidence only if the block contradicts itself; say so in the title if
   you do.
4. **Drop only these**, and count what you dropped:
   - blocks that are pure formatting, naming preference, or style with no behavioral claim;
   - blocks a compiler, type-checker, or linter would catch (missing import, type error, unused variable);
   - blocks with no `trigger` and no mechanism at all — a vague worry with nothing behind it;
   - exact restatements of the PR's own description with no defect claimed.
5. **Do not** drop a candidate because it looks minor, because you doubt it, because it is in test code,
   because it duplicates a concern the PR body acknowledges, or because you think a reviewer would wave it
   through. A later pass verifies each one against the code and decides severity. Withholding here is
   invisible and unrecoverable.
6. Renumber the survivors `T-1`, `T-2`, … in rough risk order, riskiest first, so that if the verification
   pass is capped the most important candidates are the ones verified.

## Output format (STRICT)

Output nothing but finding blocks, followed by the one summary line.

```
=== FINDING ===
id: T-<n>
title: <one line, under 90 characters>
files: <path:line or path:start-end, comma-separated>
confidence: high | medium | low
trigger: <the concrete input, state, or sequence that reaches this>
outcome: <what goes wrong when that trigger is hit>
base_behavior: <what the code at the Base SHA did in this situation>
diff_change: <exactly what this PR changed to introduce, worsen, or newly expose it>
merged_from: <contributing lens ids, comma-separated>
=== END FINDING ===
```

Then exactly one final line:

```
TRIAGE: <n> candidates, <m> merged, <k> dropped
```

If every candidate was dropped or there were none, output only that line with the counts and no blocks.
Preserve any `COVERAGE GAP:` lines from the reviewers verbatim as additional final lines.
