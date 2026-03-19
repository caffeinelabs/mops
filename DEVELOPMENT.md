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


3. Switch network to local
```
mops-local set-network local
```

Now you can install/publish packages locally like this `mops-local add <pkg>`

Also you can switch network to staging to work with staging registry like this `mops-local set-network staging`