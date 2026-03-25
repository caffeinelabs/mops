# Mops CLI Release

## 1. Update changelog

Move items from `## Next` in `CHANGELOG.md` into a new version heading:

```markdown
## Next

## X.Y.Z
- Change 1
- Change 2
```

The heading must match the exact version string — the release workflow parses it to extract release notes.

## 2. Bump version

```bash
cd cli
npm version patch --no-git-tag-version  # or: minor / major
```

## 3. Create a release PR

```bash
git checkout -b <username>/release-X.Y.Z
git add cli/CHANGELOG.md cli/package.json cli/package-lock.json
git commit -m "release: CLI vX.Y.Z"
git push -u origin <username>/release-X.Y.Z
gh pr create \
  --title "release: CLI vX.Y.Z" \
  --body "Release CLI vX.Y.Z." \
  --label release
```

> **First time?** The `release` label must exist in the repo before `--label release` succeeds. Create it once at **Settings → Labels → New label** (name: `release`).

The [`release-pr.yml`](../.github/workflows/release-pr.yml) workflow runs on every update and validates:
- PR title matches `release: CLI vX.Y.Z`
- `cli/CHANGELOG.md` has an entry for the version
- `cli/package.json` version matches

## 4. Enable auto-merge

```bash
gh pr merge --auto --squash
```

Once all required checks pass the PR merges automatically. On merge, `release-pr.yml` pushes the `cli-vX.Y.Z` tag, which triggers the [`release.yml`](../.github/workflows/release.yml) workflow — it builds, publishes to npm, creates a GitHub Release, deploys canisters (`cli.mops.one` and `docs.mops.one`), and opens a PR with on-chain release artifacts.

Monitor at [Actions → Release CLI](https://github.com/caffeinelabs/mops/actions/workflows/release.yml).

> **Note:** This workflow only deploys the `cli` and `docs` canisters. The `main`, `assets`, `blog`, and `play-frontend` canisters require a manual deploy. If a release includes changes to any of those (e.g. `backend/main/` or `frontend/`), upgrade them manually (staging first, then `ic`):
>
> ```bash
> NODE_ENV=production dfx deploy --no-wallet --identity mops --network <staging|ic> <canister>
> ```

## 5. Artifacts PR

After the release pipeline completes, it creates and auto-merges a `cli-releases: vX.Y.Z artifacts` PR. No action needed unless it fails — monitor at [Actions → Release CLI](https://github.com/caffeinelabs/mops/actions/workflows/release.yml) and merge the artifacts PR manually if needed.

## Verify build

Anyone can verify a released version by rebuilding from source. Instructions are included in each [GitHub Release](https://github.com/caffeinelabs/mops/releases).

```bash
cd cli
docker build . --build-arg COMMIT_HASH=<commit_hash> --build-arg MOPS_VERSION=<mops_version> -t mops
docker run --rm --env SHASUM=<build_hash> mops
```
