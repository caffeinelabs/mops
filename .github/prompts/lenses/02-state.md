## Your lens: state, loops, retries and concurrency (LENS_ID = `STATE`)

Trace the changed control flow by hand rather than reading it for plausibility. Most defects this lens finds
are invisible on iteration one and obvious on iteration two.

For every loop, retry, accumulator, cache, memo, pool, or mutable collection this PR adds or changes:

- **Run two iterations on paper.** Write out the state at the end of pass 1 and the start of pass 2. Look
  for a collection that is reset, cleared, or reassigned wholesale between passes and so loses what earlier
  passes recorded — and for one that is never cleared and so accumulates stale entries.
- **Termination.** What makes the loop stop? Construct the input where it does not, or where it stops early
  leaving work undone. Check that whatever the exit condition reads is actually updated inside the body.
- **Retry eligibility.** When failures are retried, ask which failures *cannot* be fixed by retrying — a
  malformed input, a 404, a validation error. Are those retried anyway? Does one item's transient failure
  drag unrelated items into another attempt? Is a single failure reported once, or once per attempt?
- **Partial failure.** With N items in flight and item k failing, what is the state of the other N-1? Is
  persistent state (a file, a lockfile, a manifest) left consistent with what actually succeeded?
- **Concurrency.** Two tasks that resolve to the same work item — the same package, key, file, or request —
  running at the same time. Is the work shared, or duplicated? Is there a shared mutable structure written
  from more than one concurrent task? Is a bound (pool size, budget, thread count) computed once from a
  value that later changes?
- **Ordering and awaits.** A promise created but not awaited, awaited later than intended, or awaited inside
  a loop that was meant to be parallel. A fire-and-forget whose rejection is unhandled.
- **Early return and error paths.** For each `return`, `break`, `continue`, and `throw` added or moved: what
  cleanup, write, or tail step is now skipped that used to run?
