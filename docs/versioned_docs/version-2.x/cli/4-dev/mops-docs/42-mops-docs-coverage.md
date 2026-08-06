---
slug: /cli/mops-docs-coverage
---

# `mops docs coverage`

Generate a documentation coverage report to track which parts of your codebase have documentation.

## Usage

```bash
mops docs coverage [options]
```

## Options

- `-s, --source <source>` - Source directory containing .mo files (default: `src`)
- `-r, --reporter <reporter>` - Coverage reporter format (default: `files`)
- `-t, --threshold <threshold>` - Coverage threshold 0-100. Exit with error if below threshold (default: `70`)

## Reporters

### `files` (default)
Shows coverage percentage for each file:

```
$ mops docs coverage --reporter files
• Math.mo 85.71%
• Utils.mo 100.00%
• Types.mo 33.33%
--------------------------------------------------
Documentation coverage: 72.95%
```

### `compact`
Shows only the total coverage:

```
$ mops docs coverage --reporter compact
Documentation coverage: 72.95%
```

### `missing`
Shows only files and items with missing documentation:

```
$ mops docs coverage --reporter missing
• Types.mo 33.33%
  ✖ Person type
  ✖ Address type
--------------------------------------------------
Documentation coverage: 72.95%
```

### `verbose`
Shows all items with their documentation status:

```
$ mops docs coverage --reporter verbose
• Math.mo 85.71%
  ✓ factorial func
  ✓ fibonacci func
  ✖ pow func
• Utils.mo 100.00%
  ✓ reverse func
  ✓ capitalize func
--------------------------------------------------
Documentation coverage: 72.95%
```

## Examples

### Basic coverage report

```bash
mops docs coverage
```

### Check coverage with threshold

```bash
mops docs coverage --threshold 80
```

This will exit with error code 1 if the total coverage is below 80%.

### Show missing documentation

```bash
mops docs coverage --reporter missing
```

### Verbose coverage report

```bash
mops docs coverage --reporter verbose
```

### Check specific source directory

```bash
mops docs coverage --source lib --reporter files
```

## Coverage Calculation

Documentation coverage is calculated based on:

- **Functions** - Must have documentation comments
- **Classes** - Must have documentation comments
- **Types** - Must have documentation comments
<!-- - **Modules** - Must have documentation comments -->

Items are considered "documented" if they have documentation comments with at least 5 characters of meaningful content.

## Integration with CI/CD

You can use the threshold option in your CI/CD pipeline to enforce documentation standards:

```yaml
- name: Check documentation coverage
  run: mops docs coverage --threshold 75 --reporter missing
```

## Notes

- The command temporarily generates documentation to analyze coverage
- Only public APIs are included in coverage calculations
- Documentation comments should use triple-slash syntax (`///`)