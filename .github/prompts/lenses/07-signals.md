## Your lens: repository risk signals (LENS_ID = `SIGNALS`)

Sweep the diff for the concrete patterns this repository has been burned by. Treat each as a high-priority
candidate when present.

**Authorization and identity.** A backend hunk that deletes an owner/maintainer/admin check, widens who may
call an update method, reorders a guard, or puts an existing rejection behind an extra condition. Try to
construct a caller that was rejected at Base and is accepted at Head. If you cannot rule out newly-permitted
unauthorized access, report it — a wrongly-accepted caller is far worse than a wrongly-rejected one. Same
scrutiny for identity handling in `cli/mops.ts` and `cli/pem.ts`.

**Registry state and the publish protocol.** `backend/main/**` holds live production state; published
versions are immutable, so a defect in `PackagePublisher.mo` is permanent. Any change to state shape, the
upgrade path, or the publish sequence: trace one concrete end-to-end scenario and check what happens to
data already in the canister.

**Package integrity.** `backend/storage/**`, `cli/integrity.ts`, and the verification steps in the install
path guard everything already published. A verification call that becomes conditional, best-effort, or
skipped on a new path is a candidate finding.

**Version resolution split across sites.** Resolution logic lives in the CLI (`cli/resolve-packages.ts`,
`cli/api/resolveVersion.ts`, `cli/api/getHighestVersion.ts`) and in the registry canister
(`backend/main/registry/`). A semantic change landed in only one of them diverges what the CLI installs from
what the registry reports. Check both.

**Install, cache and lockfile.** `cli/commands/install/**`, `cli/cache.ts`, `cli/integrity.ts`. Wrong
resolution or a corrupted cache/lockfile silently affects every downstream build, and the tests cannot cover
the space. Check lockfile write ordering, what is written on partial failure, and cache key construction.

**Release and deploy pipeline.** `.github/workflows/release*.yml`, canister IDs in `canister_ids.json` and
`dfx.json`, the pinned dfx and icp-cli versions, and the pinned `icp.yaml` recipes and launcher — these are
pinned deliberately and must not be loosened.

**Workflow and supply chain.** New or modified `.github/workflows/**` that broaden triggers (especially
`pull_request_target`), add secrets, expose secrets to forked PRs, drop pinned action SHAs, or weaken
permission scoping. Also: bash correctness in `run:` blocks — quoting, `set -e` interactions with pipelines
and subshells, heredoc indentation, unset-variable handling, and error paths that mask a failure into
success.

**Deprecated `base`.** New use of the deprecated `base` standard library in code, examples, docs, or
fixtures where `core` is the canonical choice.

**Interactive prompts.** A new or changed command that can block on stdin without a non-interactive form,
which hangs in CI and agent loops.
