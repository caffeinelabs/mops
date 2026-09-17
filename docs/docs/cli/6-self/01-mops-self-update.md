---
slug: /cli/mops-self-update
sidebar_label: mops self update
---

# `mops self update`

Update the Mops CLI to the latest version.

```
mops self update
```

After installing, it checks that the `mops` on your PATH reports the new version. If another install shadows the updated one (for example a bun or Volta install ahead of the npm global prefix), the command fails and names the stale binary instead of reporting success.

When the latest version is a new **major** release, it contains breaking changes, so `mops self update` asks for confirmation and links the release notes instead of updating right away.

## `--major`

Skip the confirmation and update across major versions. This is also the only way to cross a major non-interactively — in a non-terminal environment (CI, scripts), `mops self update` prints the notice and exits successfully **without updating** unless `--major` is passed, so a scripted update never absorbs a major silently and never starts failing when one is released:

```
mops self update --major
```

Updates within the same major (new minor or patch versions) never prompt.