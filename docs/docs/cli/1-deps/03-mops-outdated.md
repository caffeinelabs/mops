---
slug: /cli/mops-outdated
sidebar_label: mops outdated
---

# `mops outdated`

Print available dependency updates within the caret bound (does not cross major versions, or pre-1.0 minor versions).
```
mops outdated
```

## Options

### `--major`

Also report updates that cross the caret bound. Mirrors [`mops update --major`](./04-mops-update.md#--major).
```
mops outdated --major
```

### `--patch`

Restrict reported updates to patch versions only. Mirrors [`mops update --patch`](./04-mops-update.md#--patch).
```
mops outdated --patch
```

Mutually exclusive with [`--major`](#--major).