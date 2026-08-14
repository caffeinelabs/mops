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

The URL must be `http` or `https` and must speak the PocketIC control API, not the IC HTTP gateway. A malformed value fails every `mops` command with an error — broken environment config is rejected loudly rather than ignored. `--replica dfx` is unaffected.

Limitations of attached mode:

- **Canister log output is not streamed.** Mops reads canister logs from the stderr of the server process it spawns; an attached server's stderr is out of reach, so `mops test --mode replica` shows per-file pass/fail but no test names and no `Debug.print` output (a warning is printed once).
- **Version compatibility is the operator's responsibility.** Mops cannot check the remote server's version; keep the server on a PocketIC release compatible with the `@dfinity/pic` client bundled in your Mops version (9.0.0 or newer). An incompatible server surfaces as a connection or protocol error naming this variable.
- `mops bench` records no `replicaVersion` in saved or published results, since the remote server's version is unknown (and the URL itself would leak environment details).
