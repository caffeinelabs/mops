---
slug: /cli/mops-sources
sidebar_label: mops sources
---

# `mops sources`

Prints the final resolved package sources.

The main purpose of this command is to be specified in the dfx.json file:
```json
...
	"defaults": {
		"build": {
			"packtool": "mops sources"
		}
	},
...
```

The output is formatted to be passed to the `moc`.

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

If the dependency graph contains packages with the same name but different major versions, they will be treated as conflicting. Packages that differ only in minor or patch version are not conflicting — the highest one wins.

Conflicts are always reported, and always on stderr, so the resolved sources on stdout stay parseable by dfx.

Possible values:
- `warning` - Report conflicts _(default)_
- `error` - Report conflicts and exit with error code
- `ignore` - Accepted for compatibility, behaves like `warning`. It no longer silences the report

To resolve a conflict, pin the version you want in your own `mops.toml`: a root dependency always wins over a transitive one. This is also how you pick up a transitive dependency's bugfix release before the package in between republishes.