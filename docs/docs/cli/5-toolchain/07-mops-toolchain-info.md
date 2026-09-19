---
slug: /cli/mops-toolchain-info
sidebar_label: mops toolchain info
---

# `mops toolchain info`

Show release information about a toolchain tool from GitHub.

```
mops toolchain info <tool>
```

`<tool>` is one of `moc`, `lintoko`, `wasmtime`, `pocket-ic`, or `wasm-opt`.

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

Print release versions, one per line (newest first). By default fetches only the first GitHub releases page (up to 100 releases). Useful for scripting.

```
mops toolchain info moc --versions
```

### `--all`

With `--versions`, paginate through every GitHub releases page. Use for full-history cache warming.

```
mops toolchain info moc --versions --all
```

### `--prerelease`

Include prereleases instead of listing stable releases only. Applies to the version history and to the `latest` line.

```
mops toolchain info moc --prerelease
mops toolchain info moc --versions --prerelease
```

Drafts are never listed, with or without the flag.

By default, listed versions match what `mops toolchain update` and `mops toolchain use <tool> latest` resolve to (the first stable GitHub release).

## Output

Displays:
- Latest release (prerelease only with `--prerelease`)
- Pinned version from `[toolchain]` in `mops.toml` (when run inside a project)
- GitHub repository link
- Recent version history (from the first releases page)
