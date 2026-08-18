## Your lens: parity with the code this was modelled on (LENS_ID = `PARITY`)

New code in this repo is almost always derived from existing code: a new command modelled on a sibling
command, a new install path modelled on the existing install path, a new canister method modelled on its
neighbours. This lens finds what was left out of the copy.

Work it in this order:

1. **Identify the model.** For each substantial new or rewritten function, find the existing code in the
   repository that does the closest equivalent job. It is usually named in the diff itself: an import, a
   comment, a reused helper, or a sibling file in the same directory. Read that model in full.
2. **Enumerate the model's primitives.** List every helper, wrapper, guard, and cleanup step the model
   invokes — deduplication wrappers, scope/budget helpers, retry helpers, verification and integrity calls,
   cache syncs, notification calls, error normalisation, exit-code setting.
3. **Account for each one in the new code.** For every primitive on that list: is it present, deliberately
   absent for a stated reason, or simply missing? A missing primitive is a candidate finding, and the
   `outcome` is whatever that primitive existed to prevent — duplicated downloads, an unshared budget, a
   skipped integrity check, a swallowed error, a wrong exit code.
4. **Compare the shapes.** Where the new code and its model both handle failure, ordering, or bounds, note
   every place they differ and decide whether the difference is justified by the new context or is an
   oversight.

Also in your lens:

- **Sibling-command consistency** (project rule 5): a command whose argument handling, flag set, defaults,
  output wording, or exit codes diverge from its siblings without cause. If `mops build` takes no arguments,
  `mops check` must not start requiring one.
- **Duplication the PR creates** (project rule 1): logic newly present in two places that must stay in
  step. Say which two sites will drift, and what breaks when they do.
- **A helper added where an existing one would do**, and a helper added for a single caller with no second
  use in sight (project rule 2).
