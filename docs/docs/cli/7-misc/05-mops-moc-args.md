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
args = ["-W=M0223,M0236,M0237", "-Werror"]
```

```
$ mops moc-args
-W=M0223,M0236,M0237
-Werror
```

Each flag is printed on its own line.

See also: [`[moc]` config section](../../09-mops.toml.md#moc).
