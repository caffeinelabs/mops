# Mops CLI Release

## Automated (preferred)

1. Ensure `## Next` in [`CHANGELOG.md`](CHANGELOG.md) has the entries you want to ship.
2. Run [**Prepare CLI release**](https://github.com/caffeinelabs/mops/actions/workflows/prepare-cli-release.yml) → choose `patch` / `minor` / `major`.
3. Approve the release PR when CI is green (auto-merge is already enabled).

That workflow rolls `## Next` into a version heading, bumps `cli/package.json`, and opens a PR titled `release: CLI vX.Y.Z` with the `release` label.

The [`release-pr.yml`](../.github/workflows/release-pr.yml) workflow validates the PR (title, changelog entry, `package.json` version). On merge it pushes the `cli-vX.Y.Z` tag, which triggers [`release.yml`](../.github/workflows/release.yml) — build, npm publish, GitHub Release, and deploy of `cli.mops.one` / `docs.mops.one`.

> **Note:** This pipeline only deploys the `cli` and `docs` canisters. The `main`, `assets`, `blog`, and `play-frontend` canisters require a manual deploy. If a release includes changes to any of those (e.g. `backend/main/` or `frontend/`), upgrade them manually (staging first, then `ic`):
>
> ```bash
> NODE_ENV=production dfx deploy --no-wallet --identity mops --network <staging|ic> <canister>
> ```

## Artifacts PR

After the release pipeline completes, it creates and auto-merges a `cli-releases: vX.Y.Z artifacts` PR. No action needed unless it fails — monitor at [Actions → Release CLI](https://github.com/caffeinelabs/mops/actions/workflows/release.yml) and merge the artifacts PR manually if needed.

## Manual fallback

### 1. Update changelog

Move items from `## Next` in `CHANGELOG.md` into a new version heading:

```markdown
## Next

## X.Y.Z
- Change 1
- Change 2
```

The heading must match the exact version string — the release workflow parses it to extract release notes.

### 2. Bump version

```bash
cd cli
npm version patch --no-git-tag-version  # or: minor / major
```

### 3. Create a release PR and enable auto-merge

```bash
git checkout -b <username>/release-X.Y.Z
git add cli/CHANGELOG.md cli/package.json cli/package-lock.json
git commit -m "release: CLI vX.Y.Z"
git push -u origin <username>/release-X.Y.Z
gh pr create \
  --title "release: CLI vX.Y.Z" \
  --body "Release CLI vX.Y.Z." \
  --label release
gh pr merge --auto --squash
```

## Verify build

Anyone can verify a released version by rebuilding from source. Instructions are included in each [GitHub Release](https://github.com/caffeinelabs/mops/releases).

```bash
cd cli
docker build . --build-arg COMMIT_HASH=<commit_hash> --build-arg MOPS_VERSION=<mops_version> -t mops
docker run --rm --env SHASUM=<build_hash> mops
```
