---
slug: /how-to-version-a-package
sidebar_label: How to version a package
---

# How to version a package

**TL;DR:** Follow the [Semantic Versioning](https://semver.org/).

### Semantic Versioning

Given a version number MAJOR.MINOR.PATCH, increment the:

1. MAJOR version when you make incompatible API changes
2. MINOR version when you add functionality in a backward compatible manner
3. PATCH version when you make backward compatible bug fixes

[`mops bump`](/cli/mops-bump) command can help you to bump the version of your package.

### How do I know when to release 1.0.0?

- If your package is being used in production, it should probably already be 1.0.0.
- If you have a stable API on which users have come to depend, you should be 1.0.0.
- If you’re worrying a lot about backward compatibility, you should probably already be 1.0.0.

Also see: [How dependency resolution works](/how-dependency-resolution-works).