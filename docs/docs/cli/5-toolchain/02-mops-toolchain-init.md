---
slug: /cli/mops-toolchain-init
sidebar_label: mops toolchain init
---

# `mops toolchain init`

Initialize Mops toolchain management.

```
mops toolchain init
```

This command should be run only once.

This command is only needed to make `dfx` use `moc` version specified in `mops.toml` file.

It will update your current shell's config file (detected from `$SHELL`, e.g. `~/.zshrc` for zsh or `~/.bashrc` for bash) to set `DFX_MOC_PATH` to the `moc-wrapper`.
So when you build your project with `dfx`, it will use `moc` version specified in `mops.toml` file — the same compiler `mops build` and `mops check` use, instead of the one bundled with `dfx`.

:::note
`moc-wrapper` requires `moc` to be pinned in `[toolchain]`; it no longer falls back to the `dfx`-bundled compiler. Run [`mops toolchain use moc <version>`](./03-mops-toolchain-use.md) first.
:::

## Options

### `--shell <bash|zsh>`

Update the config file of a specific shell instead of the one detected from `$SHELL`. Run the command once per shell you use.

```
mops toolchain init --shell bash
```

:::info
In CI environment, this command runs automatically when you run `mops install` or `mops toolchain use`. In GitHub Actions it also writes `DFX_MOC_PATH` to `$GITHUB_ENV`, so it applies to subsequent workflow steps.

So no need to run it manually in GitHub Actions.
:::

To undo changes made by this command, run [`mops toolchain reset`](./06-mops-toolchain-rest.md) command — it cleans all known shell config files, no matter which shell was initialized.
