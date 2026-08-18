## Your sweep: correctness (SWEEP_ID = `CORRECTNESS`)

Does the changed code do the wrong thing for some reachable input? Find bugs by construction — pick the
input that breaks each decision — not by reading for smells. The test suite is another sweep's job; here you
reason about the production code directly.

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
