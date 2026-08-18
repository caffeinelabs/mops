## Your sweep: fit (SWEEP_ID = `FIT`)

Does the change fit the code around it, and does every new knob actually reach the user? Everything here is
mechanically checkable — do the checks, do not eyeball them.

**Parity with the code this was modelled on.** New code in this repo is almost always derived from existing
code: a command modelled on a sibling command, an install path on the existing install path, a canister
method on its neighbours. This finds what was left out of the copy.

1. Identify the model. For each substantial new or rewritten function, find the existing code doing the
   closest equivalent job — usually named in the diff itself by an import, a comment, a reused helper, or a
   sibling file in the same directory. Read it in full.
2. Enumerate the model's primitives: every helper, wrapper, guard and cleanup step it invokes —
   deduplication wrappers, scope/budget helpers, retry helpers, verification and integrity calls, cache
   syncs, notification calls, error normalisation, exit-code setting.
3. Account for each one in the new code: present, deliberately absent for a stated reason, or missing? A
   missing primitive is a finding, and its `outcome` is whatever that primitive existed to prevent —
   duplicated downloads, an unshared budget, a skipped integrity check, a swallowed error, a wrong exit code.
4. Where new code and its model both handle failure, ordering or bounds, note every difference and decide
   whether the new context justifies it.

**Reachability of every new knob.** For each option, flag, argument, config key, env var or parameter added
or threaded through:

- Find its declaration site. A CLI option must be declared on its command in `cli/cli.ts` (Commander
  `.option()` / `.argument()`); a `mops.toml` key must be parsed in `cli/mops.ts` and typed in
  `cli/types.ts`.
- Find a caller that can actually supply it end to end. A parameter threaded through several functions but
  never declared where a user could set it is dead wiring — the feature silently does nothing. Report it.
  A declared option no code reads is dead too.
- A new option must appear in `--help` with a non-empty description and in the matching
  `docs/docs/cli/<section>/<command>.md`.

**Contracts that must move together.** Check each pair the diff touches:

- `apiVersion` in `cli/mops.ts` ↔ `API_VERSION` in `backend/main/main-canister.mo`.
- Backend Candid surface (actor methods, public types, query/update annotations) ↔
  `cli/declarations/main/main.did{,.js,.d.ts}` and the hand-maintained `index.{js,d.ts}` beside them ↔ the
  frontend copies, if it consumes the changed types.
- `mops.toml` schema ↔ `docs/docs/09-mops.toml.md` ↔ `cli/types.ts` / the parser in `cli/mops.ts`.
- A CLI command or flag change ↔ `docs/docs/cli/`, `## Next` in `cli/CHANGELOG.md`,
  `.agents/skills/mops-cli/SKILL.md`. `docs/docs/` is the 3.x tree and `docs/versioned_docs/version-2.x/`
  the 2.x tree; a change shipping in a 2.x release needs both.
- Backend actor field or type-shape changes ↔ an enhanced-migration entry under `migrations/` or
  `next-migration/`.

**Exhaustiveness.** A new variant added to a Motoko or TypeScript union type, silently absorbed by an
existing wildcard elsewhere — `case _` in `.mo`, `default:` or a trailing `else` in `.ts`. Search every site
that switches on that type.

**Consistency and duplication.** Sibling commands whose argument handling, flags, defaults, output wording or
exit codes diverge without cause. Logic newly present in two places that must stay in step — say which two
sites will drift and what breaks when they do. A helper added where an existing one would do, or added for a
single caller with no second use in sight.
