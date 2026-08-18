## Your lens: history and prior review (LENS_ID = `HISTORY`)

Read the change in the light of how this code got to be the way it is. Your inputs are under
`.ai-review-context/history/`:

- `commits.txt` — recent commits touching the changed files, newest first.
- `blame/<path>.blame` — blame for the lines this PR changes, so you can see which commit last touched each
  one and why.
- `prior-review-comments.md` — review comments left on earlier merged PRs that touched these same files.
  This is what human reviewers have already asked for in this code.

Work these questions:

- **Does this PR undo something recent?** A constant, default, guard, version, or deprecation flag flipped
  back to a state the repository deliberately moved away from is a candidate finding — most often a bad
  merge or rebase artifact rather than an intentional revert. The commit subject that introduced the current
  value tells you whether it was deliberate. If the PR body does not justify the flip, report it.
- **Does a changed line carry the fix for an earlier bug?** Blame that points at a commit whose subject
  reads like `fix(...)`, `revert`, `hotfix`, or references an issue means the current shape is load-bearing.
  Removing or rewriting it without preserving the fix is a candidate finding — name the commit.
- **Has a reviewer already objected to this?** If `prior-review-comments.md` shows a reviewer asking for
  something in this code — a guard, a test, a naming convention, an error path — and this PR reintroduces
  what was objected to, report it and quote the prior comment.
- **Is this area churning?** Several recent commits fixing the same function is evidence the area is subtle;
  a rewrite there deserves a candidate finding if it drops any of the accumulated special cases. List the
  special cases you can see in the history and check each one survives.
- **Was the changed code recently introduced by an incomplete change?** If blame shows part of a feature
  landed recently and this PR extends it, check whether the earlier commit's TODOs or partial wiring are
  now resolved or still dangling.

If the history files are missing or empty, say so once in a `COVERAGE GAP:` line and review what you can
from the diff and the checkout.
