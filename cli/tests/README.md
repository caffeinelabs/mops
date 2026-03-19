# CLI Test Fixtures

Each subdirectory under `check/`, `check-stable/`, etc. is a self-contained test fixture with its own `mops.toml`.

## Adding a new fixture

1. Create a directory with a `mops.toml` and the `.mo` files your test needs.
2. Only declare `[dependencies]` if your `.mo` files actually import from them. Unused dependencies cause `moc` to receive `--package` flags pointing to directories that may not exist on CI.
3. If your fixture declares `[dependencies]`, add a `mops install` step for it in `.github/workflows/ci.yml` under the "Pre-cache" step. Test fixtures' `.mops/` directories are gitignored and don't exist on CI unless explicitly installed.
4. If your fixture uses a `[toolchain]` moc version that isn't already pre-cached in CI, add a download step for it in the same CI pre-cache block.

## Why this matters

Jest runs test suites in parallel. Without pre-installation:
- Multiple workers race to download the same `moc` binary, corrupting the cache.
- `moc` fails when `--package` flags point to missing `.mops/` directories.
