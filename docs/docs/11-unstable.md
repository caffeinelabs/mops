---
slug: /unstable
sidebar_label: Unstable features
---

# Unstable features

Experimental functionality you can opt into before it is finished. Features on this page carry **no compatibility guarantee**: behavior, configuration keys, and output formats may change or be removed in any release, including patch releases. Do not build anything on them that cannot tolerate breakage.

This page is the only place unstable features are documented — the regular configuration and CLI reference pages describe stable behavior only. When a feature stabilizes, its documentation moves to the regular pages and the changelog announces the promotion.

## Build manifest

```toml
[build]
manifest = true
```

When enabled, `mops build` writes a JSON build record per canister — `<canister>.build.json` — into the build output directory, next to the `.wasm`, `.did`, and `.most` it describes:

```json
{
  "version": 1,
  "canister": "backend",
  "moc": "1.15.0",
  "outputs": {
    "wasm": { "path": "backend.wasm", "sha256": "…" },
    "did": { "path": "backend.did", "sha256": "…" },
    "most": { "path": "backend.most", "sha256": "…" }
  },
  "checks": [
    { "name": "stable-compatibility", "baseline": "empty", "passed": true }
  ]
}
```

The manifest records **facts about the build** for external tooling (deployment platforms, CI, provenance pipelines) to interpret; it never affects the build itself.

- `moc` — the `[toolchain] moc` version pin, or `null` when moc is pinned to a local path.
- `outputs` — the artifacts as finally written, hashed (SHA-256) after candid metadata embedding and the `[optimize]` pass. Paths are relative to the manifest's own directory. The hashed `.did` is the moc-generated one on disk; when `[canisters.<name>].candid` declares a candid file, the wasm's embedded `candid:service` comes from that declaration instead and may differ.
- `checks` — outcomes of observational checks. They are recorded, never gate the build: a `false` does not fail `mops build`.
  - `stable-compatibility` with `baseline: "empty"` runs `moc --stable-compatible` between an empty actor's stable signature and the built canister's `.most`. `passed: true` means the canister's stable state is reachable from an empty (fresh) canister; `false` typically means a migration requires pre-existing state, so the wasm is only meaningful as an upgrade of a canister that already holds that state.

A manifest never outlives the artifacts it describes: `mops build` deletes any existing `<canister>.build.json` at the start of each canister build, whether or not the feature is enabled.

While unstable, the schema may change without a `version` bump. The `version` field becomes meaningful when the feature stabilizes.
