---
slug: /cli/mops-sources
sidebar_label: mops sources
---

# `mops sources`

Prints the final resolved package sources.

The output is formatted to be passed to `moc`, one `--package` flag pair per line. It is meant to be consumed by a build tool that accepts a "packtool" command, or spliced into a `moc` invocation of your own.

Mops does not support `dfx`, and this command does not make it supported: it carries dependency paths only, never the compiler. A build tool that brings its own `moc` will keep using it, whatever `[toolchain] moc` says.

Example output:
```
--package base .mops/base@0.10.4/src
--package time-consts .mops/time-consts@1.0.1/src
--package map .mops/map@9.0.1/src
--package ic .mops/ic@1.0.1/src
```

## Options

### `--no-install`

Do not install dependencies before resolving sources.

### `--conflicts <action>`

What to do with dependency version conflicts.

If the dependency graph requests the same registry dependency at different major versions, that is treated as conflicting. Packages that differ only in minor or patch version are not conflicting — the highest one wins. `repo` and `path` dependencies carry no comparable major version and never take part in a conflict.

Conflicts are reported on stderr, so the resolved sources on stdout stay machine-parseable.

Possible values:
- `warning` - Report conflicts _(default)_
- `error` - Report conflicts and exit with error code
- `ignore` - Do not report conflicts

To resolve a conflict, pin the version you want in your own `mops.toml`: a root dependency always wins over a transitive one. This is also how you pick up a transitive dependency's bugfix release before the package in between republishes.

If you have reviewed a cross-major conflict and decided to keep it, use `--conflicts ignore` to stop reporting it. Because `mops sources` runs on every build that invokes it as a packtool, this is the way to silence a conflict you have accepted:

```
mops sources --conflicts ignore
```

Other commands resolve dependencies too (`mops install`, `mops build`, `mops test`), and they report cross-major conflicts with no way to turn it off.

## Lockfile

`mops sources` installs from [`mops.lock`](../../10-mops.lock.md) when it is valid, but never writes it and never prints integrity output — its stdout is machine-parsed.

It has no `--locked` flag: failing in the middle of someone else's build is a poor place to report a stale lockfile. Enforce it with a preceding `mops install --locked` step instead.
