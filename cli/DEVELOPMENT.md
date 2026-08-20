# Mops CLI development

Releasing is a separate document: [RELEASE.md](RELEASE.md).

## Prerequisites

- Node.js >= 22 and npm
- [bun](https://bun.sh) — `npm run build` bundles with `bun build`
- GNU tar, on macOS only (`bundle:tar` builds the reproducible tarball with `tar --sort name`, which BSD tar lacks):

  ```
  brew install gnu-tar
  ```

  To make it available in your shell as `tar`, add the following to your `~/.zshrc` or `~/.bashrc`:

  ```
  export PATH="$HOMEBREW_PREFIX/opt/gnu-tar/libexec/gnubin:$PATH"
  ```

## Dev loop

```bash
cd cli
npm ci
npm run check           # tsc --noEmit
npm test                # Jest (all tests)
npm test -- build.test.ts                    # single test file
npm test -- --testNamePattern="pattern"      # filter by test name
npm run build           # TypeScript compile + bundle
```

To run your working copy against a project, use the repo-root helper — it runs the CLI from source via `tsx`:

```bash
npm run mops -- install
```

## Reproducible build

Every release's bundle hash is published by the [build-hash workflow](https://github.com/caffeinelabs/mops/actions/workflows/build-hash.yml). To reproduce a build locally (requires Docker; the builder base image lives in [`cli-builder/`](../cli-builder/)):

```bash
cd cli
MOPS_VERSION=<version> COMMIT_HASH=<commit_hash> ./build.sh
```

To verify a released bundle against its published hash:

```bash
docker build . --build-arg COMMIT_HASH=<commit_hash> --build-arg MOPS_VERSION=<mops_version> -t mops
docker run --rm --env SHASUM=<build_hash> mops
```
