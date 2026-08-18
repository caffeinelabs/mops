# AI review eval cases

A labelled regression suite for the AI PR review pipeline. Each case is a real diff from this repository
where we know what a careful human reviewer found, so a prompt change can be measured instead of guessed at.

Without this, every claim about the review getting better is folklore: the posted PR comment is overwritten
by the next run, so a miss becomes unrecoverable within the hour. Cases are how a miss becomes a fixture.

## Running

```bash
export CURSOR_API_KEY=...            # the same token the workflow uses
.github/prompts/eval/replay.sh                        # every case
.github/prompts/eval/replay.sh 772-single-pass-update # one case
```

The replay checks the case's `head_sha` out into a throwaway git worktree and runs the pipeline there, but
takes the prompts and scripts from your **current** checkout — so you are testing today's pipeline against a
past diff. Results land in `.github/prompts/eval/results/<case>/` (gitignored): the posted review, every
pass's prompt, the raw per-sweep candidates, and the judge's dispositions.

Each run makes real API calls and costs real tokens. `REVIEW_SWEEPS` works here just as it does in the
workflow, so you can narrow a run to the one sweep you are changing:

```bash
REVIEW_SWEEPS=01-correctness .github/prompts/eval/replay.sh 772-single-pass-update
```

A full run is four agent calls; a single-sweep run is two.

## Reading the output

The score has two columns per defect, and the gap between them is the interesting part:

| column | meaning |
| --- | --- |
| `candidate` | a sweep described the defect |
| `reported`  | it survived the judge's refutation and filtering into the posted review |

- `- / -`: nobody found it. A sweep needs work, or the defect needs a check that does not exist yet.
- `HIT / -`: a sweep found it and the judge threw it away. That is a refutation or filtering problem, and a
  much cheaper fix than a recall problem.
- `HIT / HIT`: recovered.

Matching is by regex over the review text, so it is a proxy for "the reviewer described this defect". Read
the artifacts before trusting a HIT, and treat a MISS on a finding that is clearly described as a regex worth
improving rather than a pipeline failure.

## Adding a case

Any PR where a human found something the review missed — or where the review cried wolf — is worth keeping.
Copy an existing case and fill in:

- `base_sha` / `head_sha` — the diff as the review saw it. For a miss, `head_sha` is the commit that was
  approved, **not** the fixed one.
- `fix_sha` — where the defects were actually fixed, so a reader can see the answer.
- `verdict_at_the_time` and `expected_verdict`.
- one `defect:` block per known defect, each with `files`, a `match:` regex, `why:` in enough detail to judge
  a reviewer's description against it, and the `sweep:` that ought to catch it.

False positives are worth recording too: give the case a defect-free expectation and let a spurious finding
show up as a decision mismatch.

The SHAs must be reachable locally — fetch the original branch before replaying a case whose branch has since
been deleted.
