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

## Project Environment

### `MOPS_ENV`

Expanded into local `path` dependencies that contain the `{MOPS_ENV}` placeholder (defaults to `local` when unset):

```toml
[dependencies]
envdep = "./envs/{MOPS_ENV}/dep"
```

```bash
export MOPS_ENV="staging"
mops install
```

The lockfile stores the expanded path, so it is specific to the `MOPS_ENV` it was generated under — a lockfile generated under a different value counts as stale, and `mops install --locked` fails on it. See [`{MOPS_ENV}` path dependencies](../../10-mops.lock.md#mops_env-path-dependencies).

### `MOPS_CWD`

Change the working directory before the command runs. Useful for npm scripts, where npm sets the working directory to the package root:

```bash
MOPS_CWD="canisters/backend" mops install
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

## PocketIC

### `MOPS_POCKET_IC_URL`

Connect to an already-running PocketIC server instead of spawning the `[toolchain] pocket-ic` binary. Applies to every Mops-managed PocketIC use: `mops build --check-deploy`, `mops test --mode replica`, `mops bench`, `mops watch`, and the tests and benchmarks `mops publish` runs.

Mops creates a PocketIC instance (`POST /instances`) for the run and deletes that instance when the command finishes — including on SIGINT. It never starts or stops the server process.

When this variable is set, a `[toolchain] pocket-ic` pin is ignored (Mops prints a warning) and the binary is not downloaded.

```bash
export MOPS_POCKET_IC_URL="http://127.0.0.1:8001"
mops build --check-deploy
```

The URL must be `http` or `https` and must speak the PocketIC control API, not the IC HTTP gateway. A malformed value fails every `mops` command with an error — broken environment config is rejected loudly rather than ignored.

Limitations of attached mode:

- **Canister log output is not streamed.** Mops reads canister logs from the stderr of the server process it spawns; an attached server's stderr is out of reach, so `mops test --mode replica` shows per-file pass/fail but no test names and no `Debug.print` output (a warning is printed once).
- **Version compatibility is the operator's responsibility.** Mops cannot check the remote server's version; keep the server on a PocketIC release compatible with the `@dfinity/pic` client bundled in your Mops version (9.0.0 or newer). An incompatible server surfaces as a connection or protocol error naming this variable.
- `mops bench` records no `replicaVersion` in saved or published results, since the remote server's version is unknown (and the URL itself would leak environment details).
