---
slug: /cli/mops-user-set
sidebar_label: mops user set
---

# `mops user set`

Set user properties.

```
mops user set <prop> <value>
```

You can get the current value with:
```
mops user get <prop>
```

## Available properties

- `name` - username on mops.one
- `site` - personal website URL
- `email` - email address
- `github` - github username
- `twitter` - twitter username

## Examples

```bash
mops user set name zen
mops user set site https://example.com
mops user set email zen@example.com
mops user set github ZenVoich
mops user set twitter mops_one
```

How this appears on mops.one:

![user info on mops.one](user-info.png)
