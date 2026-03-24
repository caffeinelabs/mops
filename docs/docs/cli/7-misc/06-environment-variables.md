---
slug: /cli/environment-variables
sidebar_label: Environment Variables
---

# Environment Variables

Mops CLI supports several environment variables to customize its behavior.

## Network Selection

### `MOPS_NETWORK`

Override the active network (`local`, `staging`, or `ic`). Equivalent to `mops set-network` but without persisting to disk. Useful in CI/CD pipelines and Docker containers where `mops set-network` may not have write access.

When set to `local`, the agent fetches the root key from the replica (required for local replicas) and defaults to `http://127.0.0.1:4943`.

```bash
export MOPS_NETWORK="local"
mops install
```

## Registry Configuration

### `MOPS_REGISTRY_HOST`

Override the registry replica or boundary node URL. Useful for pointing to a local IC replica or custom deployment during development.

```bash
export MOPS_REGISTRY_HOST="http://127.0.0.1:4943"
mops install
```

### `MOPS_REGISTRY_CANISTER_ID`

Override the registry canister principal. Use this to target a specific registry canister instance.

```bash
export MOPS_REGISTRY_CANISTER_ID="your-custom-canister-id"
mops install
```

### Combined Usage

Both variables can be set together to redirect all registry operations to a custom deployment:

```bash
export MOPS_REGISTRY_HOST="http://mops-alternative.host:4943"
export MOPS_REGISTRY_CANISTER_ID="2d2zu-vaaaa-aaaak-qb6pq-cai"
mops install
```

These overrides apply to all registry operations (`add`, `install`, `publish`, `search`, etc.) and work with any network selection (staging, ic, or local).
