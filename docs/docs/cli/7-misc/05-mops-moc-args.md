---
slug: /cli/mops-moc-args
sidebar_label: mops moc-args
---

# `mops moc-args`

Print global `moc` compiler flags defined in the `[moc]` config section of `mops.toml`.

```
mops moc-args
```

Useful when invoking `moc` directly and you want to include the flags configured in your project.

### Example

```toml
# mops.toml
[moc]
args = ["--default-persistent-actors", "-Werror"]
```

```
$ mops moc-args
--default-persistent-actors
-Werror
```

Each flag is printed on its own line.

See also: [`[moc]` config section](/mops.toml#moc).
