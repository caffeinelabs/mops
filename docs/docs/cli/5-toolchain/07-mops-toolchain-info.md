---
slug: /cli/mops-toolchain-info
sidebar_label: mops toolchain info
---

# `mops toolchain info`

Show release information about a toolchain tool from GitHub.

```
mops toolchain info <tool>
```

Works without a `mops.toml` — useful for scripts that warm tool caches.

### Examples

Show info for `moc`:
```
mops toolchain info moc
```

Show info for `lintoko`:
```
mops toolchain info lintoko
```

## Options

### `--versions`

Print all stable release versions, one per line (oldest to newest). Useful for scripting.

```
mops toolchain info moc --versions
```

Prereleases and drafts are excluded. Stable versions match what `mops toolchain update` and `mops toolchain use <tool> latest` resolve to (first stable GitHub release). Interactive `mops toolchain use` without a version may also list prereleases in its picker.

## Output

Displays:
- Latest stable release
- Pinned version from `[toolchain]` in `mops.toml` (when run inside a project)
- GitHub repository link
- Recent version history
