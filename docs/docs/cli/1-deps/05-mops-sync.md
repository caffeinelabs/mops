---
slug: /cli/mops-sync
sidebar_label: mops sync
---

# `mops sync`

Analyze source code and:
- Add missing packages that are used in the source code but are not listed in `mops.toml`
- Remove unused packages listed in `mops.toml` but not imported in the source code

```
mops sync
```

The [lockfile](/mops.lock) is always kept in sync — there is no flag to opt out.
