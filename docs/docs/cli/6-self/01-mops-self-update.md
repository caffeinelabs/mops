---
slug: /cli/mops-self-update
sidebar_label: mops self update
---

# `mops self update`

Update the Mops CLI to the latest version.

```
mops self update
```

When the latest version is a new **major** release, it contains breaking changes, so `mops self update` asks for confirmation and links the release notes instead of updating right away.

## `--major`

Skip the confirmation and update across major versions. This is also the only way to cross a major non-interactively — in a non-terminal environment (CI, scripts), `mops self update` prints the notice and exits successfully **without updating** unless `--major` is passed, so a scripted update never absorbs a major silently and never starts failing when one is released:

```
mops self update --major
```

Updates within the same major (new minor or patch versions) never prompt.

## Global installs only

`mops self update` updates the CLI installed globally with npm or pnpm (`npm i -g ic-mops` or `cli.mops.one/install.sh`). It does not update `ic-mops` declared as a project dependency: when the `mops` on PATH is a `node_modules/.bin/mops` (as with `npx mops self update`), the command fails and points to `npm i -D ic-mops@<version>` instead.

After installing, it checks that the `mops` on your PATH reports the new version. If another install shadows the updated one (for example a bun or Volta install ahead of the npm global prefix), the command fails and names the stale binary instead of reporting success. If the new version instead landed earlier on PATH than the copy that was running (for example a different nvm Node version), the update succeeds and names the leftover copy; run `hash -r` if the current shell still reports the old version.
