# Mops CLI

## Prerequisites

On macOS, you need to install `gnu-tar` package:
```
brew install gnu-tar
```

To make it available in your shell as `tar`, add the following to your `~/.zshrc` or `~/.bashrc`:
```
export PATH="$HOMEBREW_PREFIX/opt/gnu-tar/libexec/gnubin:$PATH"
```

## Steps

1. Run `bun install`

2. Update changelog in `CHANGELOG.md` file

3. Push latest commits to `main` branch

4. Check reproducibility of the build (see below)

5. Update the version in `package.json` using `npm version` command

6. Publish

## Publish to npm
```
npm publish
```

## Check reproducibility of the build

Check release hash of latest build for version `0.0.0` at https://github.com/caffeinelabs/mops/actions/workflows/build-hash.yml

Build locally version `0.0.0`
```
MOPS_VERSION=0.0.0 ./build.sh
```

Compare hashes.

## Publish on-chain
_Run from root of the project_

1. Make sure Docker is running

2. Prepeare release
```
npm run release-cli
```

3. Deploy canister
```
dfx deploy --network ic --no-wallet cli --identity mops
```

## Verify build

```
docker build . --build-arg COMMIT_HASH=<commit_hash> --build-arg MOPS_VERSION=<mops_version> -t mops
docker run --rm --env SHASUM=<build_hash> mops
```