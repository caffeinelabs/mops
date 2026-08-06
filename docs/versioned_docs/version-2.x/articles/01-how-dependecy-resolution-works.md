---
slug: /how-dependency-resolution-works
sidebar_label: How dependency resolution works
---

# How dependency resolution works

1. Direct dependencies listed in `mops.toml` are always resolved to the specified version.
_Only for project's root `mops.toml` file. Does not apply to `mops.toml` files of dependencies_

2. Compatible transitive dependency versions are resolved to the highest version in the dependency graph.

3. Incompatible transitive dependency versions are reported as warnings.


### Version compatibility

Dependency versions are considered compatible if they have the same major version.

For example:
- `1.0.0` and `2.0.0` are incompatible
- `1.0.0` and `1.1.0` are compatible
- `0.1.0` and `0.23.0` are compatible

### Unwanted dependency changes

If you don't change the version of a direct dependency, the version of the transitive dependencies will not change.

So, unchanged `mops.toml` - unchanged dependency graph.