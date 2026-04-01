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

## Options

### `--versions`

Print all published versions, one per line. Useful for scripting.
```
mops info base --versions
```

## Output

Displays package metadata including:
- Version and description
- License
- Repository, homepage, and documentation links
- Dependencies and dev-dependencies
- Keywords
- Version history
