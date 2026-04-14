---
name: frontend-testing
description: Test frontend changes end-to-end and deploy to staging for verification. Use when testing frontend PRs, verifying frontend migrations, testing UI changes, or when the user asks to test the frontend before production. Covers automated checks, local dev server testing, staging deployment, and browser-based verification.
---

# Frontend Testing

Full testing workflow for frontend changes. The agent runs automated checks and local dev server tests (Phases 1–2), then hands off deployment to the human (Phase 3), and finally verifies the deployed app via the browser MCP (Phase 4).

## Phase 1: Automated Checks

Run from the repo root:

```bash
npm run lint
npm run build-frontend
npm run build-cli-releases
```

All must pass before proceeding. Fix any failures introduced by the frontend changes.

## Phase 2: Local Dev Server Testing

Kill anything on ports 3000/3001 to avoid conflicts:

```bash
lsof -ti:3000,3001 | xargs kill -9 2>/dev/null; echo "ports cleared"
```

Start the main frontend dev server (from repo root):

```bash
cd frontend && DFX_NETWORK=ic npx vite --port 3000
```

Start the cli-releases frontend (from repo root, in a separate terminal):

```bash
cd cli-releases/frontend && npx vite preview --port 3001
```

### What to check

1. **No runtime errors** in the Vite terminal output — look for `[vite] (client)` error lines. Warnings (unused CSS selectors, a11y hints) are acceptable.
2. **HTML shell serves** — `curl -s http://localhost:3000/` returns HTML with `<div id="root">`. Same for `http://localhost:3001/`.
3. **SPA routes serve** — `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/core` returns 200.

**Do NOT use the browser MCP on localhost** — the embedded browser shows a blank page for this SPA on the Vite dev server. Browser-based verification happens in Phase 4 against the deployed staging build.

Kill the dev servers after checks pass.

## Phase 3: Deploy to Staging (Human)

**This phase must be run by the human in their terminal.** The agent cannot reliably run `dfx deploy` due to a `ColorOutOfRange` TTY panic in dfx v0.29.1 within Cursor's shell, and potential macOS keychain prompts for identity access.

Print the following instructions for the human and wait for confirmation before proceeding to Phase 4.

---

### Instructions for the human

Deploy the frontend to the staging `assets` canister.

**Prerequisites**:
- `dfx` installed via `dfxvm`
- `dfx identity` with controller access to staging canisters (e.g. `mops`)
- Dependencies installed (`npm install` in repo root)

**Important**: `dfxvm` automatically uses the dfx version pinned in `dfx.json`. Do NOT run `dfxvm update`, `dfxvm install`, or `dfxvm default` to "fix" the version — this is correct behavior.

**Run from the repo root:**

```bash
dfx deploy assets --network staging -y
```

After deployment, tell the agent to continue with Phase 4 verification.

---

## Phase 4: Verify Staging Deploy

The staging URL is: **https://ogp6e-diaaa-aaaam-qajta-cai.icp0.io**

This phase can be done by the agent (via browser MCP), the human (manually), or both.

### Agent verification (browser MCP)

Use `user-browsermcp` to verify the deployed build:

1. Navigate to the staging URL, wait 5s, take a snapshot
2. **Check package count** — "Total packages" must show a non-zero number and packages should be listed on the homepage.
3. Click into a package — verify tabs render: Code, Docs, Readme, Versions, Dependencies, Dependents, Tests, Benchmarks
4. Check `browser_console_messages` — no `process is not defined` or `Package not found` errors. `Invalid asm.js` warnings are pre-existing and acceptable.
5. Navigate back to homepage — verify layout, fonts, and styling look correct

### Human verification

Give the human the staging link and ask them to visually compare with production:

- **https://ogp6e-diaaa-aaaam-qajta-cai.icp0.io** (staging)
- **https://mops.one** (production)

Key things to check: fonts, button styles, layout, package detail pages, search.

### Troubleshooting

- **Page blank or doesn't load**: Check `dfx canister status assets --network staging` for cycle balance.
- **`Package not found` errors**: The `ic-mops` npm package may be querying the wrong backend. Ensure the code has `window.MOPS_NETWORK` set to `"ic"` for non-local deployments (see `frontend/components/package/Package.svelte`).
