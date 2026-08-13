---
slug: /cli/environment-variables
sidebar_label: Environment Variables
---

# Environment Variables

Mops CLI supports several environment variables to customize its behavior.

## Network Selection

### `MOPS_NETWORK`

Select the network (`local`, `staging`, or `ic`). This is the only way to change it — mops defaults to `ic` and never persists a network selection to disk, so every process that should talk to a different registry needs the variable set.

When set to `local`, the agent fetches the root key from the replica (required for local replicas) and defaults to `http://127.0.0.1:4943`.

:::note
Since mops 3.0.0 the agent makes update calls over the IC HTTP API `v3` synchronous-call endpoint. A local replica has to serve it — [`icp`](https://js.icp.build/) and recent `dfx` do; a pre-`v3` replica does not.
:::

```bash
export MOPS_NETWORK="local"
mops install
```

## Install Tuning

### `MOPS_CONCURRENCY`

Cap the number of simultaneous registry requests during package installs (an integer ≥ 1). Applies to every command that installs packages — `mops install`, `mops add`, `mops build`, `mops test`, `mops sources`, and so on. Equivalent to [`mops install --concurrency <n>`](../1-deps/02-mops-install.md#--concurrency-n); the flag wins when both are set.

The default is derived from the CPU count (2 × cores, clamped to 4–16) and capped by the file-descriptor soft limit. Transient network failures retry on their own with the concurrency halved, but a low explicit value still helps environments that are constrained in ways mops cannot see — an egress proxy capping concurrent connections, for example:

```bash
export MOPS_CONCURRENCY=2
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
