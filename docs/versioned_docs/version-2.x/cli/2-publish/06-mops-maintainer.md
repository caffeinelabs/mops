---
slug: /cli/mops-maintainer
sidebar_label: mops maintainer
---

# `mops maintainer`

List, add or remove  maintainers of a package.

:::info
Check the [Package owners and maintainers](/package-owners-and-maintainers) for more information.
:::

## `mops maintainer`
Manage maintainers of the current package.

### `mops maintainer list`

List all maintainers of the package.

### `mops maintainer add`

Add new package maintainer.
```
mops maintainer add <principal>
```

### `mops maintainer remove`

Remove package maintainer.
```
mops maintainer remove <principal>
```

## Example

Imagine you have a package named `hello` and you want to add the principal `2d2zu-vaaaa-aaaak-qb6pq-cai` as a maintainer.

mops.toml:
```toml
[package]
name = "hello"
version = "0.1.0"
...
```

Add the maintainer:
```
mops maintainer add 2d2zu-vaaaa-aaaak-qb6pq-cai
```