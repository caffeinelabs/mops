---
name: frontend-testing
description: Test frontend changes end-to-end and deploy to staging for human verification. Use when testing frontend PRs, verifying frontend migrations, testing UI changes, or when the user asks to test the frontend before production. Covers automated checks, local dev server testing, and staging deployment with production data.
---

# Frontend Testing

Full testing workflow for frontend changes. The agent runs automated checks, deploys to staging with production data, verifies the deployed app via the browser MCP, then hands the staging link to the human for a final check.

## Phase 1: Automated Checks

Run these from the repo root:

```bash
npm run lint
npm run build-frontend
npm run build-cli-releases
```

All must pass before proceeding. Fix any failures introduced by the frontend changes.

## Phase 2: Local Dev Server Testing

First, kill anything on ports 3000/3001 to avoid port conflicts:

```bash
lsof -ti:3000,3001 | xargs kill -9 2>/dev/null; echo "ports cleared"
```

Start the main frontend dev server (from repo root):

```bash
cd frontend && DFX_NETWORK=ic npx vite --port 3000
```

Start the cli-releases frontend (from repo root):

```bash
cd cli-releases/frontend && npx vite preview --port 3001
```

### What to check

1. **No runtime errors** in the Vite terminal output — look for `[vite] (client)` error lines. Warnings (unused CSS selectors, a11y hints) are acceptable.
2. **HTML shell serves** — `curl -s http://localhost:3000/` returns HTML with `<div id="root">`. Same for `http://localhost:3001/`.
3. **SPA routes serve** — `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/core` returns 200.

**Do NOT use the browser MCP on localhost** — the embedded browser shows a blank page for this SPA on the Vite dev server. All browser-based verification happens in Phase 4 against the deployed staging build.

Kill the dev servers after checks pass.

## Phase 3: Deploy to Staging

Deploy the frontend to the staging `assets` canister pointed at the **production** backend.

### How it works

`frontend/vite.config.ts` reads `canister_ids.json` at build time, keyed by `DFX_NETWORK`. Swapping `main.staging` to the production ID makes the staging frontend talk to the production backend.

### Prerequisites

- `dfx` installed via `dfxvm`
- `dfx identity` with controller access to staging canisters (e.g. `mops`)
- Dependencies installed

**Important**: `dfxvm` automatically uses the dfx version pinned in `dfx.json`. This means `dfx --version` will show the project-pinned version, NOT the dfxvm default — this is correct behavior. Do NOT run `dfxvm update`, `dfxvm install`, or `dfxvm default` to "fix" this.

### Deploy steps

**Run each step individually. Do not paste them as a single script.**

**Step 1** — From the **repo root**, swap the staging main canister ID to production:

```bash
PROD_MAIN=$(jq -r '.main.ic' canister_ids.json)
jq --arg id "$PROD_MAIN" '.main.staging = $id' canister_ids.json > tmp && mv tmp canister_ids.json
```

**Step 2** — Verify the swap. Both values must be identical:

```bash
jq '.main' canister_ids.json
```

If they differ, the swap failed — do not proceed.

**Step 3** — Build and deploy (from repo root):

```bash
DFX_NETWORK=staging dfx deploy assets --network staging
```

Look for "Module hash" in the output to confirm success.

**Step 4** — Revert `canister_ids.json` immediately:

```bash
git checkout canister_ids.json
```

Verify `git status` shows no changes to `canister_ids.json`. **Never commit the swap.**

## Phase 4: Verify Staging Deploy

Use the browser MCP (`cursor-ide-browser`) to verify the deployed build. The staging URL is:

**https://ogp6e-diaaa-aaaam-qajta-cai.icp0.io**

### Verification steps

1. Navigate to the staging URL
2. Wait 5s, then take a snapshot
3. **Check package count** — look for "Total packages" in the page. It must show **200+** packages (production data). If it shows ~15, the canister ID swap in Phase 3 failed — go back and redeploy.
4. Click into the `core` package — verify all tabs render: Code, Docs, Readme, Versions, Dependencies, Dependents, Tests, Benchmarks
5. Check `browser_console_messages` for critical errors
6. Navigate back to homepage and try search (e.g. "core")

### If verification fails

- **~15 packages instead of 200+**: The swap didn't take effect. Re-run Phase 3 from Step 1, verifying Step 2 output carefully before deploying.
- **Page blank or doesn't load**: Check `dfx canister status assets --network staging` for cycle balance.
- **`core` package not found**: This means the frontend is talking to the staging backend (which doesn't have `core`). Same fix — redo the swap.

After verification passes, give the human the staging link for a final visual check.

## Safety Notes

- Staging frontend is **read-only** against production — it only queries, never mutates.
