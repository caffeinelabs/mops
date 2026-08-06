# Development

## Folder structure

- `backend/` - Source code for the backend
  - `backend/main/` - Package registry canister
  - `backend/storage/` - Storage canisters
- `frontend/` - Source code for the package registry frontend ([mops.one](https://mops.one))
- `cli/` - Source code for the `mops` command line tool
- `cli-builder/` - Docker base image for reproducible Mops CLI builds
- `cli-release/` - Mops CLI builds and frontend
  - `cli-release/frontend/` - Frontend for the Mops CLI ([cli.mops.one](https://cli.mops.one))
  - `cli-release/versions/` - Mops CLI versions
- `docs/` - Mops documentation ([docs.mops.one](https://docs.mops.one))
- `blog/` - Mops blog ([blog.mops.one](https://blog.mops.one))
- `ui-kit/` - Mops UI Kit with shared UI components
- `bench/` - Dogfood for `mops bench` command
- `test/` - Dogfood for `mops test` command

## Local Development

The local pipeline runs on [icp-cli](https://github.com/dfinity/icp-cli) (config in `icp.yaml`). Install the same versions CI pins:

```bash
npm install -g @icp-sdk/icp-cli@1.2.0 @icp-sdk/ic-wasm@0.11.1
```

`npm start` - starts local replica and dev server

To be able to install/publish packages locally:

1. Install `tsx` or `bun` globally
```
npm install -g tsx
```

2. Add `mops-local` alias to your shell (`~/.zshrc`, `~/.bashrc`)
```bash
alias mops-local="tsx /<path-to-local-mops>/cli/environments/nodejs/cli.ts"
```
or
```bash
alias mops-local="bun /<path-to-local-mops>/cli/environments/nodejs/cli.ts"
```


3. Point the CLI at your local registry

`MOPS_NETWORK=local` alone is not enough: the built-in `local` endpoint assumes the fixed canister id dfx used to pin via `specified_id`, and icp-cli has no equivalent — the local replica allocates the id at create time. Pass the deployed one explicitly:

```bash
export MOPS_REGISTRY_HOST="http://127.0.0.1:4943"
export MOPS_REGISTRY_CANISTER_ID="$(jq -r .main .icp/cache/mappings/local.ids.json)"
```

Now you can install/publish packages locally like this `mops-local add <pkg>`

To work against the staging registry instead, `export MOPS_NETWORK=staging` (no overrides needed), or set it per command: `MOPS_NETWORK=staging mops-local add <pkg>`.

See [Environment Variables](/cli/environment-variables) in the documentation for details.