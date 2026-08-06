---
slug: /cli/mops-docs-generate
---

# `mops docs generate`

Generate documentation for Motoko code using the built-in documentation generator.

## Usage

```bash
mops docs generate [options]
```

## Options

- `--source <source>` - Source directory containing .mo files (default: `src`)
- `--output <output>` - Output directory for generated documentation (default: `docs`)
- `--format <format>` - Output format: `md`, `adoc`, or `html` (default: `md`)

## Description

The `mops docs generate` command uses the Motoko documentation generator (`mo-doc`) to create documentation from your Motoko source code. It extracts documentation comments and generates formatted documentation files.

## Examples

### Generate markdown documentation

```bash
mops docs generate
```

This generates markdown documentation from the `src` directory and outputs it to the `docs` directory.

### Generate HTML documentation

```bash
mops docs generate --format html
```

### Generate documentation from custom source directory

```bash
mops docs generate --source lib --output documentation
```

### Generate AsciiDoc documentation

```bash
mops docs generate --format adoc --output docs/asciidoc
```

## Output Formats

- **markdown (`md`)** - Human-readable markdown files
- **html** - HTML files with styling for web viewing
- **adoc** - AsciiDoc format for advanced document processing

## Documentation Comments

To generate meaningful documentation, add documentation comments to your Motoko code:

```motoko
/// Calculate the factorial of a natural number.
///
/// Example:
/// ```motoko
/// let result = factorial(5); // 120
/// ```
public func factorial(n : Nat) : Nat {
    if (n <= 1) { 1 } else { n * factorial(n - 1) }
}
```

## Notes

- The command uses the `mo-doc` tool that comes with your Motoko compiler
- Documentation is generated from triple-slash comments (`///`)
- Functions, classes, types, and modules can all be documented
- The generated documentation includes type signatures and examples