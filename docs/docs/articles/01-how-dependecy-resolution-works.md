---
slug: /how-dependency-resolution-works
sidebar_label: How dependency resolution works
---

# How dependency resolution works

1. Direct dependencies listed in `mops.toml` are always resolved to the specified version (or highest satisfying version for ranges).
_Only for project's root `mops.toml` file. Does not apply to `mops.toml` files of dependencies_

2. Compatible transitive dependency versions are resolved to the highest version in the dependency graph.

3. Incompatible transitive dependency versions are reported as errors.

4. When a version range is used (e.g. `^1.2.3`), all transitive constraints must be satisfiable. If a root dependency pins an exact version that is too low for a transitive dependency's range, the resolver will report an error.


### Version ranges

Dependencies can specify exact versions or version ranges:

```toml
[dependencies]
core = "1.2.3"       # exact: only 1.2.3
core = "^1.2.3"      # caret: >=1.2.3, <2.0.0
core = "~1.2.3"      # tilde: >=1.2.3, <1.3.0
```

The **caret** (`^`) allows updates that do not change the leftmost non-zero component. This is the default when adding packages with `mops add`.

The **tilde** (`~`) allows only patch-level updates within the same minor version.


### Version compatibility

Dependency versions are considered compatible if they have the same major version.

For example:
- `1.0.0` and `2.0.0` are incompatible
- `1.0.0` and `1.1.0` are compatible
- `0.1.0` and `0.23.0` are compatible

### Lock file

The `mops.lock` file records the exact resolved versions for all dependencies. When a lock file is present and up to date, `mops install` uses the locked versions directly without re-resolving ranges.

Run `mops update` to re-resolve ranges and update the lock file with the latest compatible versions.

### Unwanted dependency changes

If you don't change the version of a direct dependency, the version of the transitive dependencies will not change.

So, unchanged `mops.toml` - unchanged dependency graph.
