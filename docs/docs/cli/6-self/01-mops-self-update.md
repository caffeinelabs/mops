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

Skip the confirmation and update across major versions. This is also the only way to cross a major non-interactively — in CI or any other non-terminal environment, `mops self update` refuses a major update unless `--major` is passed:

```
mops self update --major
```

Updates within the same major (new minor or patch versions) never prompt.