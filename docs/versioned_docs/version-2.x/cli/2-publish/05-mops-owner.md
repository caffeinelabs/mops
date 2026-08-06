---
slug: /cli/mops-owner
sidebar_label: mops owner
---

# `mops owner`

List, add or remove owners of a package.

:::info
Check the [Package owners and maintainers](/package-owners-and-maintainers) for more information.
:::

## `mops owner`
Manage owners of the current package.

### `mops owner list`

List all owners of the package.

### `mops owner add`

Add new package owner.
```
mops owner add <principal>
```

### `mops owner remove`

Remove package owner.
```
mops owner remove <principal>
```

## Example

Imagine you have a package named `hello` and you want to add the principal `2d2zu-vaaaa-aaaak-qb6pq-cai` as an owner.

mops.toml:
```toml
[package]
name = "hello"
version = "0.1.0"
...
```

Add the owner:
```
mops owner add 2d2zu-vaaaa-aaaak-qb6pq-cai
```