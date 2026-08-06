---
slug: /cli/mops-check-candid
sidebar_label: mops check-candid
---

# `mops check-candid`

Check Candid interface compatibility between two Candid files

```
mops check-candid <new-candid> <original-candid>
```

Verifies that a new Candid interface is compatible with an original interface. Compatibility means that clients using the original interface will continue to work with the new interface.

### Examples

Check if a new interface is compatible with the original
```
mops check-candid ./build/backend.did ./src/backend.did
```


## Arguments

### `<new-candid>`

Path to the new Candid interface file (the candidate interface to validate).

### `<original-candid>`

Path to the original Candid interface file (the baseline for compatibility).

## Compatibility Rules

Compatible changes:
- Add new optional fields to records
- Add new variant options
- Make function parameters optional
- Add new methods
- Extend return types

Breaking changes:
- Remove fields from records
- Remove variant options
- Change field types incompatibly
- Remove methods
- Make optional parameters required

:::info
The [`mops build`](/cli/mops-build) command automatically runs Candid compatibility checks when a `candid` field is specified in the canister configuration.
:::
