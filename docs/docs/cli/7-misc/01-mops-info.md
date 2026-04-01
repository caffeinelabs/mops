---
slug: /cli/mops-info
sidebar_label: mops info
---

# `mops info`

Show detailed information about a package from the mops registry.
```
mops info <package>
```

### Examples

Show info for the latest version of the `base` package
```
mops info base
```

Show info for a specific version
```
mops info base@0.10.0
```

### Output

Displays package metadata including:
- Version, description, and license
- Repository, homepage, and documentation links
- Publisher and publication date
- Owners and maintainers
- Download statistics (total, last 30 days, last 7 days)
- Dependencies and dev-dependencies
- Keywords
- Version history
- Quality indicators (tests, docs, license, etc.)
- Toolchain requirements (moc, dfx)
