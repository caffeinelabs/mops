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

1. **`dfx.json`** — sets `defaults.build.packtool = "mops sources"` if `dfx.json` is present. Existing indentation is preserved.
2. **`mops.toml`** — `[package]` metadata for packages. For projects, `[dependencies]` is populated with the default package set keyed on your `dfx` version (from `dfx.json` or `dfx --version` on `PATH`). Older `dfx` versions `0.9.0`–`0.27.0` resolve to the `base` release bundled with that `dfx`. For any other version, or when `dfx` cannot be detected, the latest `core` is used.
3. **`src/lib.mo`** — starter module (package only, when `src/` doesn't exist).
4. **`test/lib.test.mo`** — starter test (package only, when you opted in and `test/` doesn't exist).
5. **`LICENSE`** (and `NOTICE` for Apache-2.0) — package only, filled with the current year and copyright owner.
6. **`README.md`** — package only, with placeholders replaced by the package name.
7. **`.github/workflows/mops-test.yml`** — when the workflow prompt was accepted.
8. **`.mops`** appended to `.gitignore` (created if missing).

Existing `LICENSE`, `README.md`, and workflow files are not overwritten.

For projects, `mops install` runs at the end to fetch the default packages.

### Migrating from Vessel

If `vessel.dhall` exists, `mops init` reads it and copies the listed dependencies into the new `mops.toml`. Dev-dependencies are not migrated. Skipped when `--yes` is used.

## Options

### `--yes`, `-y`

Skip prompts and initialize as a **project** with defaults: no `[package]` section, no starter files, GitHub workflow enabled, default packages installed per the rules in [What it creates](#what-it-creates). Useful for CI and scripted scaffolding.

```
mops init --yes
```
