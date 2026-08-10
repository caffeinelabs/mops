---
slug: /cli/mops-init
sidebar_label: mops init
---

# `mops init`

Initialize a new Motoko project or package in the current directory.

```
mops init
```

Exits without changes if `mops.toml` already exists.

## Interactive prompts

### 1. Project type

```
Select type:
› Project (I just want to use mops packages in my project)
  Package (I plan to publish this package on mops)
```

- **Project** — you want to consume mops packages. No `[package]` section is written.
- **Package** — you plan to publish to the mops registry. Prompts for metadata and creates starter files.

### 2. Package metadata (package only)

- **Name** — defaults to the kebab-cased directory name
- **Description**
- **Repository URL**
- **Keywords** — space-separated
- **License** — `MIT` or `Apache-2.0`
- **Copyright owner** — written into the license file
- **Add example test file?** — defaults to yes, creates `test/lib.test.mo`

The version is initialized to `1.0.0`.

### 3. GitHub workflow

```
Setup GitHub workflow? (run `mops test` on push)
```

When accepted, adds `.github/workflows/mops-test.yml` that runs `mops test` on push to `main`/`master` and on every pull request.

## What it creates

1. **`mops.toml`** — `[package]` metadata for packages. No dependencies are added; use [`mops add`](./1-deps/01-mops-add.md) to install the packages you need.
2. **`src/lib.mo`** — starter module (package only, when `src/` doesn't exist).
3. **`test/lib.test.mo`** — starter test (package only, when you opted in and `test/` doesn't exist).
4. **`LICENSE`** (and `NOTICE` for Apache-2.0) — package only, filled with the current year and copyright owner.
5. **`README.md`** — package only, with placeholders replaced by the package name.
6. **`.github/workflows/mops-test.yml`** — when the workflow prompt was accepted.
7. **`.mops`** and **`.migrations-*/`** appended to `.gitignore` (created if missing).

Existing `LICENSE`, `README.md`, and workflow files are not overwritten.

:::note
`mops init` touches nothing outside your project. It does not contact the registry, does not add any dependencies, and — since mops v3 — does not write a `dfx.json`. Add what you need with [`mops add`](./1-deps/01-mops-add.md), and pin a compiler with [`mops toolchain use moc <version>`](./5-toolchain/03-mops-toolchain-use.md) — every command that compiles requires a pinned `moc`.
:::

### Migrating from Vessel

Vessel auto-migration was removed in mops v3 (it had been deprecated since 2.14). `vessel.dhall` is ignored. Copy your dependencies into `mops.toml` manually and delete `vessel.dhall` / `package-set.dhall`.

## Options

### `--yes`, `-y`

Skip prompts and initialize as a **project** with defaults: no `[package]` section, no starter files, GitHub workflow enabled. Useful for CI and scripted scaffolding.

```
mops init --yes
```
