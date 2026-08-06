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

It will update your `.bashrc`/`.zshrc` file to set `DFX_MOC_PATH` to the `moc-wrapper`.
So when you build your project with `dfx`, it will use `moc` version specified in `mops.toml` file. If `moc` version is not specified, it will use default `moc` version that comes with `dfx`.

:::info
In CI environment, this command runs automatically when you run `mops install` or `mops toolchain use`.

So no need to run it manually in GitHub Actions.
:::

To undo changes made by this command, run [`mops toolchain reset`](/cli/mops-toolchain-reset) command.
