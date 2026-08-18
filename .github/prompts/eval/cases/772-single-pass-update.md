# Case 772 — single-pass `mops update`

A 645-add / 122-del rewrite of `mops update` into a single-pass, parallel install flow. The AI review
approved it in 2m19s with an all-✅ table and zero findings; a human review of the same diff found six
defects, all fixed in `fix_sha`. This is the case the four-pass pipeline exists to pass.

    pr: 772
    base_sha: 120cd737a25110606e822dad01d85a18b958702d
    head_sha: f762d01ead11915a448c674f646d0e08d7539b62
    fix_sha: 679f58a3ef2f8307dda4f4cca51453a39c6904c4
    verdict_at_the_time: APPROVE
    expected_verdict: REQUEST_CHANGES

## Known defects

Each defect lists the regex the replay scores against. A regex is a proxy for "the reviewer described this
defect" — treat a HIT as a hint and read the artifacts before believing it, and treat a MISS on a
well-described finding as a regex to improve, not a pipeline failure.

    defect: key-section-split-brain
    files: cli/commands/update.ts
    match: (dev-dependencies|devDeps).*(key|section)|(key|section).*(dev-dependencies|devDeps)
    why: The key an update is written under came from `allDeps.find(matchesKey)` while the section came from
      a second, independent `devDeps.some(matchesKey)`. A package declared in both sections is written under
      one section's key into the other section.
    lens: INPUTS

    defect: pinned-alias-prefix-match
    files: cli/commands/update.ts, cli/commands/available-updates.ts
    match: startsWith|prefix|segment boundary|"map@1"|10\.
    why: `oldVersion.startsWith(pinnedVersion)` makes the pinned alias key `"map@1"` claim a 10.x update.
      Needs a version-segment boundary. The same logic existed at base in `available-updates.ts`, so this is
      the moved/copied-code carve-out: the PR re-implemented it at a new site.
    lens: INPUTS

    defect: duplicate-update-tasks
    files: cli/commands/update.ts
    match: duplicate|twice|two tasks|same (key|package).*(twice|concurrent)
    why: A package reported twice by `getAvailableUpdates` produced two update tasks, so the same version
      installed concurrently twice.
    lens: INPUTS

    defect: missing-dedupe-install
    files: cli/commands/update.ts
    match: dedupeInstall|depKey|transitive.*(twice|again|duplicate)|download(ed)? twice
    why: The install did not go through `dedupeInstall` with the key `installDeps` builds, so an updated dep
      that is also a transitive of another updated dep downloaded and verified twice. `install-deps.ts` is
      the module this code was modelled on and it uses that primitive.
    lens: PARITY

    defect: deterministic-failure-retried
    files: cli/commands/update.ts
    match: deterministic|non-?transient|not retr|retried.*(once per|each) attempt|failed = new Map
    why: `failed` was reassigned wholesale each attempt, and a deterministic failure was retried whenever a
      sibling hit a transient error — reporting it once per attempt instead of once.
    lens: STATE

    defect: verbose-not-declared
    files: cli/cli.ts, cli/commands/update.ts
    match: --verbose|verbose.*(declared|option|unreachable|dead)
    why: `verbose` was threaded through `update` into the installers, the GitHub re-pin and the requirements
      check, but never declared as a Commander option, so `mops update --verbose` failed with an unknown
      option and the plumbing was unreachable. Sibling commands `add`/`remove`/`install` all declare it.
    lens: WIRING
