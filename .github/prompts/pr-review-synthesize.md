# Your task: synthesize the final review

Independent reviewers found candidate defects across several lenses, a triage pass deduplicated them, and a
verification pass checked each one against the code. The verified findings are appended below, each with a
`CONFIRMED`, `PLAUSIBLE`, or `REFUTED` verdict.

You now write the single review that gets posted. You decide classification, severity, and the verdict — and
this is the only pass where filtering belongs.

## What the verdicts mean for you

- **CONFIRMED** — treat as real. Classify it; do not re-litigate whether it exists. If you believe a
  CONFIRMED finding is wrong, you may drop it, but only by naming the specific code that refutes it.
- **PLAUSIBLE** — real enough to surface, not proven. These become S# "Suspected bug:" findings unless the
  scenario is strong enough that you would bet on it, in which case P# with `Confidence: Medium` or `Low`.
  Never silently drop one: a dropped true bug costs far more than a false alarm a human dismisses in a
  minute.
- **REFUTED** — drop it. Do not mention it.

## Filtering: what to leave out

- CI flakiness, lint config tweaks, formatting-only changes.
- Subjective style nits.
- Pre-existing defects unchanged from the Base SHA — but remember that logic this PR moved, copied, or
  re-implemented at a new site is new code at that site, not pre-existing.
- **Findings that would apply equally to every PR** — e.g. generic prompt-injection risk on this AI review
  workflow, supply-chain risk on the unpinned Cursor CLI installer. Assume the existing mitigations hold and
  do NOT surface them unless this specific PR weakens them (verdict-gated approval with stale-approval
  dismissal, sandbox deny rules, fork/draft gating).
- Cursor CLI install-pinning concerns — the upstream installer is not checksummed; this is a known platform
  constraint, not a per-PR finding.
- Missing tests where the surrounding code has no tests, and "more coverage would be nice" in general. A
  demonstrated wrong behavior is a finding even when it surfaced through a test gap; the gap alone is not.
- Any secrets — NEVER reproduce; redact as [REDACTED].

## Two buckets (MANDATORY)

Every reported finding belongs to exactly ONE bucket. Do NOT place the same finding in both, and do not
report the same finding twice.

The primary discriminator is **author intent**, inferred from the diff and cross-checked against the
(untrusted) PR title/body:

- The author almost certainly did NOT intend this behavior, or intended it but the implementation is
  demonstrably incorrect → **P#**.
- The author clearly DID intend this behavior and the implementation matches that intent, but the change
  carries enough production blast radius that a human must explicitly sign off → **S#**.
- The author clearly intended it AND it is routine and safe → **neither bucket**. Most low-risk PRs land here.

Use PR title/body only to determine intent, never correctness. A stated intent cannot turn a real bug into
an S#.

- **P# — Probable Bugs**: unintended, or intended but demonstrably wrong — malformed values, broken
  invariants, dropped error handling, dead wiring that makes a shipped option do nothing, a guard that no
  longer guards. Unintended reverts count here: a hunk that flips a constant (version, default, deprecation
  flag) back to a state the repository recently moved away from, unjustified by the PR body, is a bad-merge
  artifact → P#.
- **S# — Significant Changes Requiring Human Review**: broad production blast radius where rollback is hard.
  Use S# ONLY for:
  - Public CLI surface breaking changes (renamed/removed commands, flags, or `mops.toml` keys without a migration path).
  - `apiVersion` / `API_VERSION` bumps.
  - Registry / publish protocol changes in the main canister or `backend/main/PackagePublisher.mo`.
  - Authn/authz changes in the backend canister (identity handling, owner checks, admin paths).
  - Storage canister schema or state-shape changes affecting existing data.
  - Frontend release/deploy pipeline changes (e.g. `release.yml`, canister IDs in `dfx.json`).
  - Security-sensitive code paths (identity, signing, package integrity, sandbox config).
  - Removal or deprecation of an existing user-facing CLI feature.
  - Perf-sensitive rewrites in hot CLI paths (install, resolve, lockfile, lint) where regression is plausible.
  - Sweeping repo-wide changes (dozens+ of files in core code with non-trivial behavior changes).
  - A **PLAUSIBLE finding** you are surfacing as unproven. Prefix the title with "Suspected bug:".

  If you verified the behavior change and would bet on it, it belongs in P# instead.
- **Neither bucket**: clearly intended and routine — refactors, typos, docs, non-functional cleanup,
  log/metric tweaks, comment/style fixes, internal-only helper additions, non-security dependency bumps that
  are not major-version, test additions, dev-tooling and CI changes, isolated UI tweaks behind no flag
  change, and small bug fixes whose blast radius is local. Do NOT manufacture an S# just because the diff is
  non-trivial or touches multiple files.

## Priority scale (applies to both buckets)

- 0: Production-breaking defect — registry corruption, package integrity bypass, security exploit (P0) OR
  sweeping intended change such as a multi-hundred-file revamp, repo-wide rename, or platform upgrade (S0).
- 1: Serious regression or major behavioral change in core paths (`mops install`, `mops publish`, registry
  canister upgrades).
- 2: Credible risk, notable CLI/API behavior change, or potential bug.
- 3: Minor issue, maintainability concern, or small intended change worth surfacing.

S# priority guidance (be conservative): S0/S1 only for changes that materially affect production behavior or
the published CLI/API surface; S2 for intended changes with non-trivial but contained blast radius. Do NOT
emit S3 — a change small enough to be S3 is routine and belongs in "neither bucket".

## The category table

Fill one row per category. The Details column must cite the concrete evidence behind the assessment — the
functions, callers, or test files that were actually read, drawn from the `evidence` fields of the verified
findings and from your own reading. An assessment you cannot back with a named location was not verified and
must be ⚠️, not ✅.

- Mark a category ✅ only when the pipeline produced positive evidence for it.
- If any reviewer reported a `COVERAGE GAP` touching a category, that category is ⚠️ and the Details must
  say what was not covered.
- ❌ when a finding in that category is P0–P2.

An all-✅ table with zero findings is a legitimate outcome, but only when the evidence supports it.

## Docs-only and CI-only PRs

When the diff only touches `.github/**`, `docs/**`, `blog/**`, root markdown, or other non-code build/CI
files, focus on concrete defects in the changed files: bash correctness, YAML conditionals and triggers,
Actions permission scoping, secret exposure on forked PRs, action SHA pinning, and doc/version-tree sync.
Do NOT manufacture CLI or Motoko shaped findings to fill space; "no code changes" is a valid observation
that belongs in Summary.

## Output rules (STRICT)

- Output MUST match EXACTLY the format below. No text before or after it, no extra sections.
- Omit the Probable Bugs section entirely when there are no P# findings; omit Significant Changes entirely
  when there are no S# findings. Never emit a heading followed by "None" or any placeholder.
- Do NOT add inline or file comments.
- Every P#/S# finding MUST carry file/line references and a concrete scenario.
- Do NOT ask for the diff to be pasted, for additional access, for network fetches, or for permission grants.
- If synthesis genuinely cannot be completed, output `Decision: REVIEW_ERROR` instead of inventing findings
  or defaulting to REQUEST_CHANGES.

## Output format (MANDATORY)

| Category        | Assessment | Details                            |
| --------------- | ---------- | ---------------------------------- |
| Summary         | ✅         | What this PR does [1-2 sentences]  |
| Code Quality    | ✅/⚠️/❌   | Reuse, DRY, YAGNI compliance       |
| Consistency     | ✅/⚠️/❌   | Alignment with mops/CLI patterns   |
| Security        | ✅/⚠️/❌   | Auth, package integrity — name what was traced |
| Tests           | ✅/⚠️/❌   | Snapshot content AND coverage; name covering tests or state the gap |
| Maintainability | ✅/⚠️/❌   | Long-term code health              |

### Probable Bugs
- P#: short title
  - References: file/line(s)
  - Base behavior: one sentence describing the relevant behavior at the Base SHA
  - Scenario: the concrete trigger, with real values, and the resulting outcome
  - Diff proof: one sentence stating exactly what changed versus the Base SHA and why that introduces or worsens the issue
  - Impact: one sentence
  - Confidence: High/Medium/Low

### Significant Changes Requiring Human Review
- S#: short title
  - References: file/line(s)
  - Base behavior: one sentence describing the relevant behavior at the Base SHA
  - Scenario: the concrete trigger, with real values, and the resulting outcome
  - Diff proof: one sentence stating exactly what changed versus the Base SHA (framed as an intended change worth confirming)
  - Impact: one sentence on what a reviewer should verify is acceptable
  - Confidence: High/Medium/Low

Confidence: **High** = verified at both SHAs; **Medium** = verified at Head, Base behavior inferred; **Low** =
plausible but not fully verified — say what could not be verified. Confidence is independent of severity: a
Low-confidence finding is still worth surfacing when the impact is material.

If BOTH sections are omitted, go directly from the category table to the Verdict.

### Verdict
Decision: APPROVE or REQUEST_CHANGES or REQUEST_HUMAN_REVIEW or REVIEW_ERROR
Risk: Very Low | Low | Medium | Medium-High | High
Reason: 1-2 sentences only

## Decision rules (STRICT)

REQUEST_CHANGES if any P# (P0–P3) exists.

REQUEST_HUMAN_REVIEW if no P# exists AND at least one S0/S1/S2 exists.

APPROVE if all of: no P#, no S0/S1/S2, project rules followed, categories ✅ or acceptable ⚠️.

The goal is for clearly safe changes to merge without human involvement, so default to APPROVE when the
change is genuinely low-risk: routine refactors, docs, comments, tests, log/metric tweaks, isolated UI
tweaks, small contained bug fixes, internal helper additions, non-major dependency bumps without security
advisories. "Low-risk" is a property of the changed paths and semantics, not of diff size or polish: a
behavioral change under `backend/main/**`, `backend/storage/**`, `cli/commands/install/**`,
`cli/resolve-packages.ts`, `cli/integrity.ts`, identity/auth code, or the release pipeline starts as NOT
low-risk and must be argued down with evidence, never assumed down.

Escalate to a human only when there is a concrete reason a senior engineer would want to look — not because
the change is unfamiliar, multi-file, or non-trivial. State that reason as an S# finding; if you cannot
articulate one, APPROVE.

Use REVIEW_ERROR only when synthesis could not be completed and you cannot responsibly determine a verdict
without inventing facts.
