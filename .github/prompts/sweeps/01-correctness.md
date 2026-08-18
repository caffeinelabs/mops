## Your sweep: correctness (SWEEP_ID = `CORRECTNESS`)

Does the changed code do the wrong thing for some reachable input? Find bugs by construction — pick the
input that breaks each decision — not by reading for smells.

**Changed decisions.** For every predicate, comparison, match, lookup and branch this PR adds or changes,
work out the input where the new code and the base code disagree, and decide which is right:

- String matching standing in for structure: a prefix/suffix/substring test where a segment, boundary or
  exact match was meant. `startsWith("1")` claims `10.x`; a path prefix claims a sibling directory.
- **Two lookups that must agree**: when the code searches the same collection twice — once for a key, once
  for a flag, section, index or count — construct the input where they land on different elements (the same
  name declared in two places, two entries with one key).
- Duplicates and empties: the same item twice, zero items, one item. Check the *producer* before assuming
  duplicates cannot happen.
- Boundaries: off-by-one, `<` vs `<=`, first/last element, exactly-equal versions, empty string.
- Absent vs falsy vs empty: `undefined` / `""` / `0` / `false` / missing key, and any `||` default that
  collapses them.
- Ordering: taking the first match from a collection whose order the caller controls.

**Loops, retries and state.** For every loop, retry, accumulator, cache, pool or mutable collection:

- Run two iterations on paper. Look for a collection reset or reassigned wholesale between passes (losing
  what earlier passes recorded), and for one never cleared (accumulating stale entries).
- Termination: construct the input where it does not stop, or stops early leaving work undone.
- Retry eligibility: which failures cannot be fixed by retrying — malformed input, 404, validation? Are they
  retried anyway? Does one item's transient failure drag unrelated items along? Is a failure reported once,
  or once per attempt?
- Partial failure: with N in flight and item k failing, is persistent state (file, lockfile, manifest) left
  consistent with what actually succeeded?
- Concurrency: two tasks resolving to the same work item — same package, key, file, request — running at
  once. Shared, or duplicated? A bound computed once from a value that later changes?
- Awaits and early exits: a promise created but not awaited, or awaited inside a loop meant to be parallel; a
  fire-and-forget whose rejection is unhandled; for each added `return`/`break`/`throw`, what tail step is
  now skipped?

**Shell, when the diff touches `.sh` files or workflow `run:` blocks.** These carry their own trap set:
`set -e` with an assignment whose command substitution fails; `pipefail` turning an expected `head` SIGPIPE
(exit 141) into a failure branch; an `if`'s else branch deleting output the pipeline already wrote; unquoted
expansions; a glob that matches nothing without `nullglob`; `|| true` on the wrong command; an error path
that masks failure into success.

**Tests as an attack surface.** Not "add coverage" — find defects *through* the tests:

- Read the new tests, then the code they cover. Enumerate the inputs the new code accepts that no test
  exercises, then reason through each by hand. Any you conclude is wrong is a finding — report the wrong
  behavior, with the gap as supporting evidence.
- Assertions that cannot fail: a mock asserted called but not with what; an expectation that would pass with
  the body deleted; a substring so short it always matches.
- Every changed snapshot hunk under `cli/tests/__snapshots__/` is a recorded behavior change: a changed exit
  message, dropped warning, reordered output or large diff with no corresponding source change is a
  regression as easily as a fix.
- Mocks that no longer match the real module's shape, arity or error behavior — the suite stays green while
  the real path is broken.

Missing tests where the surrounding code has none are not a finding.
