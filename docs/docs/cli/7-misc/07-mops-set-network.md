---
slug: /cli/mops-set-network
sidebar_label: mops set-network
---

# `mops set-network`

Select the registry network for the current project.

```
mops set-network <local|staging|ic>
```

The selection is stored in `.mops/network` inside the project, so it applies only to the project you run the command in.

### Examples

Use a local registry replica for the current project

```
mops set-network local
```

Switch the current project back to the main network

```
mops set-network ic
```

## Options

### `--global`

Store the selection in the mops config directory (`~/.config/mops` on Linux, `~/Library/Application Support/mops` on macOS, honoring `XDG_CONFIG_HOME`) instead of the project. Used as a fallback for projects that have no network set.

```
mops set-network staging --global
```

## Network resolution order

1. `MOPS_NETWORK` environment variable (see [Environment Variables](/cli/environment-variables))
2. Project-local `.mops/network`
3. Global config file (written by `mops set-network --global`)
4. `ic` (default)

# `mops get-network`

Print the active network.

```
mops get-network
```
