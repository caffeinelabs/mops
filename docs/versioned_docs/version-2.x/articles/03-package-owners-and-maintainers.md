---
slug: /package-owners-and-maintainers
sidebar_label: Package owners and maintainers
---

# Package owners and maintainers

A package can have multiple owners and maintainers.

Owners have full control over the package, including the ability to publish new versions, add or remove owners, and maintainers. Maintainers can publish new versions, but they cannot add or remove owners or maintainers.

| Action | Owner | Maintainer |
|--------|-------|------------|
| Publish new versions | :heavy_check_mark: | :heavy_check_mark: |
| Add or remove owners | :heavy_check_mark: | :x: |
| Add or remove maintainers | :heavy_check_mark: | :x: |

Use [`mops owner`](/cli/mops-owner) command to manage owners of a package.

Use [`mops maintainer`](/cli/mops-maintainer) command to manage maintainers of a package.