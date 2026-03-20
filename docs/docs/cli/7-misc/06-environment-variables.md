---
slug: /cli/environment-variables
sidebar_label: Environment Variables
---

# Environment Variables

Mops CLI supports several environment variables to customize its behavior.

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
export MOPS_REGISTRY_HOST="http://host.docker.internal:4943"
export MOPS_REGISTRY_CANISTER_ID="2d2zu-vaaaa-aaaak-qb6pq-cai"
mops install
```

These overrides apply to all registry operations (`add`, `install`, `publish`, `search`, etc.) and work with any network selection (staging, ic, or local).
