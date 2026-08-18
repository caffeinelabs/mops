## Your lens: wiring and cross-file contracts (LENS_ID = `WIRING`)

Everything in this lens is mechanically checkable. Do the checks; do not eyeball them.

**Reachability of every new knob.** For each option, flag, argument, config key, environment variable, or
function parameter this PR adds or threads through:

- Find its declaration site. A CLI option must be declared on its command in `cli/cli.ts` (Commander
  `.option()` / `.argument()`); a `mops.toml` key must be parsed in `cli/mops.ts` and typed in
  `cli/types.ts`.
- Find at least one caller that can actually supply it end to end.
- A parameter threaded through several functions but never declared where a user could set it is dead
  wiring: the feature silently does nothing. Report it.
- Conversely, a declared option that no code reads is dead too.
- A new option must appear in `--help` with a non-empty description and in
  `docs/docs/cli/<section>/<command>.md` (project rule 6).

**Contracts that must move together.** Check each pair the diff touches:

- `apiVersion` in `cli/mops.ts` ↔ `API_VERSION` in `backend/main/main-canister.mo`.
- Backend Candid surface (`backend/**/*.mo` actor methods, public types, query/update annotations) ↔
  `cli/declarations/main/main.did{,.js,.d.ts}` and the hand-maintained `index.{js,d.ts}` beside them ↔ the
  frontend copies, if the frontend consumes the changed types.
- `mops.toml` schema ↔ `docs/docs/09-mops.toml.md` ↔ `cli/types.ts` / the parser in `cli/mops.ts`.
- A CLI command or flag change ↔ `docs/docs/cli/`, `## Next` in `cli/CHANGELOG.md`,
  `.agents/skills/mops-cli/SKILL.md`. Remember that `docs/docs/` is the 3.x tree and
  `docs/versioned_docs/version-2.x/` is the 2.x tree, and a change shipping in a 2.x release needs both.
- Backend actor field or type-shape changes ↔ an enhanced-migration entry under `migrations/` or
  `next-migration/`.

**Exhaustiveness.** A new variant added to a Motoko or TypeScript union type, silently absorbed by an
existing wildcard elsewhere — `case _` in `.mo`, `default:` or a trailing `else` in `.ts`. Search for every
site that switches on that type; the new variant falling into a wildcard is a candidate finding.

**Imports and boundaries.** A symbol newly exported only to be used once; a module importing across an
architectural boundary it did not previously cross (CLI importing frontend code, a command importing
another command's internals rather than a shared helper).
