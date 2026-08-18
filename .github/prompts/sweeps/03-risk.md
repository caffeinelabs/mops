## Your sweep: risk and history (SWEEP_ID = `RISK`)

Two jobs: sweep the diff for the patterns this repository has been burned by, and read the change in the
light of how the code got to be the way it is.

**Authorization and identity.** A backend hunk that deletes an owner/maintainer/admin check, widens who may
call an update method, reorders a guard, or puts an existing rejection behind an extra condition. Try to
construct a caller rejected at base and accepted at head. If you cannot rule out newly-permitted
unauthorized access, report it — a wrongly-accepted caller is far worse than a wrongly-rejected one. Same
scrutiny for identity handling in `cli/mops.ts` and `cli/pem.ts`.

**Registry state and publish protocol.** `backend/main/**` holds live production state and published
versions are immutable, so a defect in `PackagePublisher.mo` is permanent. For any change to state shape, the
upgrade path or the publish sequence, trace one concrete end-to-end scenario and check what happens to data
already in the canister.

**Package integrity.** `backend/storage/**`, `cli/integrity.ts` and the verification steps in the install path
guard everything already published. A verification call that becomes conditional, best-effort or skipped on a
new path is a finding.

**Resolution split across sites.** Version resolution lives in the CLI (`cli/resolve-packages.ts`,
`cli/api/resolveVersion.ts`, `cli/api/getHighestVersion.ts`) and in the registry canister
(`backend/main/registry/`). A semantic change landed in only one diverges what the CLI installs from what the
registry reports. Check both.

**Install, cache and lockfile.** `cli/commands/install/**`, `cli/cache.ts`, `cli/integrity.ts`. Wrong
resolution or a corrupted cache/lockfile silently affects every downstream build and the tests cannot cover
the space. Check lockfile write ordering, what is written on partial failure, and cache key construction.

**Release and supply chain.** `.github/workflows/release*.yml`, canister IDs in `canister_ids.json` and
`dfx.json`, the pinned dfx and icp-cli versions, the pinned `icp.yaml` recipes and launcher — all pinned
deliberately, none to be loosened. Workflow changes that broaden triggers (especially `pull_request_target`),
add secrets, expose secrets to forked PRs, drop pinned action SHAs, or weaken permission scoping.

**Repo conventions with teeth.** New use of the deprecated `base` standard library where `core` is canonical.
A new or changed command that can block on stdin without a non-interactive form, which hangs in CI and agent
loops.

**History.** Your inputs are in the history digest appended to this prompt (recent commits touching the
changed files, blame for the changed lines, and human review comments on earlier PRs that touched them):

- **Does this PR undo something recent?** A constant, default, guard, version or deprecation flag flipped
  back to a state the repository deliberately moved away from is a finding — usually a bad merge or rebase
  artifact rather than an intentional revert. The commit that introduced the current value tells you whether
  it was deliberate. If the PR body does not justify the flip, report it.
- **Does a changed line carry an earlier fix?** Blame pointing at a commit whose subject reads `fix(...)`,
  `revert` or `hotfix` means the current shape is load-bearing. Rewriting it without preserving the fix is a
  finding — name the commit.
- **Has a reviewer already objected to this?** If the prior review comments show a human asking for something
  in this code — a guard, a test, an error path — and this PR reintroduces what was objected to, report it and
  quote them.
- **Is the area churning?** Several recent commits fixing the same function means it is subtle. List the
  special cases visible in the history and check each survives the rewrite.

If the history digest is missing or empty, say so once in a `COVERAGE GAP:` line and sweep what you can.
