---
slug: /cli/mops-bump
sidebar_label: mops bump
---

# `mops bump`

Update `version = "x.x.x"` in mops.toml

```
mops bump [part]
```

`mops bump major` - bump major part of version (**X**.y.z)

`mops bump minor` - bump minor part of version (x.**Y**.z)

`mops bump patch` - bump patch part of version (x.y.**Z**)

`mops bump` - you will be prompted to select a part of the version to update