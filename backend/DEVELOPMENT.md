# Development

## Folder structure
- `main/` - Package registry canister
- `storage/` - Storage canisters (spawned from `main` canister)

## Guidelines
- Avoid making breaking changes to the API - this will break the users with older versions of the CLI
  - Favor implementing new features with deprecating old ones for gradual adoption
  - If you still need to make a breaking change, update the API version in the `main-canister.mo` file and create a new release
- Recommended to deploy staging (backend and frontend) first: `npm run deploy-staging`, or `npm run deploy-staging main` for the backend alone. Promote with `npm run deploy-ic` once it looks right.