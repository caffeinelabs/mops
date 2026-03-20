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

### `MOPS_REGISTRY_FALLBACK`

When using a custom registry via `MOPS_REGISTRY_HOST`, packages that aren't found there will normally produce an error. Set `MOPS_REGISTRY_FALLBACK` to any truthy value to automatically fall back to the default registry for missing packages.

This is useful when your custom registry only contains a subset of packages (e.g. your own components) while their transitive dependencies live on the main registry.

```bash
export MOPS_REGISTRY_HOST="http://127.0.0.1:4943"
export MOPS_REGISTRY_CANISTER_ID="2d2zu-vaaaa-aaaak-qb6pq-cai"
export MOPS_REGISTRY_FALLBACK=1
mops install
```

### Combined Usage

All three variables can be combined to point to a custom deployment while transparently resolving missing packages from the default registry:

```bash
export MOPS_REGISTRY_HOST="http://mops-alternative.host:4943"
export MOPS_REGISTRY_CANISTER_ID="2d2zu-vaaaa-aaaak-qb6pq-cai"
export MOPS_REGISTRY_FALLBACK=1
mops install
```

Without `MOPS_REGISTRY_FALLBACK`, all registry operations (`add`, `install`, `publish`, `search`, etc.) target only the custom endpoint. With it enabled, package lookups and downloads fall back to the default registry when a package isn't found on the custom one.
