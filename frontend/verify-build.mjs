import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Assets that must exist at an exact path in the build output. Guards against
// vite-plugin-static-copy glob/dest changes silently relocating them — a
// misplaced .well-known/ic-domains breaks mops.one custom-domain certs.
const required = [
  ".well-known/ic-domains",
  "external/onig@1.7.0.wasm",
  "external/gfm-table.css",
  ".ic-assets.json",
];

const dist = path.resolve(import.meta.dirname, "dist");
const missing = required.filter((p) => !existsSync(path.join(dist, p)));

if (missing.length) {
  console.error(
    `\n✗ Build output missing expected assets in dist/:\n${missing.map((p) => `  - ${p}`).join("\n")}\n`,
  );
  process.exit(1);
}

// The main canister id has to be baked in, not merely defined. Vite replaces
// `process.env.CANISTER_ID_MAIN` at build time and a catch-all `process.env`
// define turns a missed replacement into `undefined` at runtime — a bundle that
// builds green and cannot reach any canister.
//
// Two assertions, because neither is sufficient alone. On ic, the badge URL in
// components/package/BadgesModal.svelte hardcodes the main canister id, so
// "the id is present" is true there no matter what vite did.
//
// vite.config.ts rejects an unset or unknown value, but this file also runs
// standalone, where an unset one would otherwise read `undefined.ids.json`.
const network = process.env["MOPS_FRONTEND_NETWORK"];
if (!network) {
  console.error(
    "\n✗ MOPS_FRONTEND_NETWORK is not set." +
      "\n  Run: MOPS_FRONTEND_NETWORK=local npm run build-frontend\n",
  );
  process.exit(1);
}
const mappingsFile = path.resolve(
  import.meta.dirname,
  network === "local"
    ? "../.icp/cache/mappings/local.ids.json"
    : `../.icp/data/mappings/${network}.ids.json`,
);

let canisterIds = {};
try {
  canisterIds = JSON.parse(readFileSync(mappingsFile, "utf8"));
} catch {
  // Left empty — the failure below carries the useful message.
}
const expectedId = canisterIds["main"];

if (!expectedId) {
  console.error(
    `\n✗ No main canister id in ${mappingsFile}.` +
      `\n  The build could not read canister ids, so every lookup resolves to undefined.` +
      `\n  Locally, run: npm run deploy-local\n`,
  );
  process.exit(1);
}

const bundleDir = path.join(dist, "bundle");
const bundles = existsSync(bundleDir)
  ? readdirSync(bundleDir).filter((f) => f.endsWith(".js"))
  : [];
const sources = bundles.map((f) =>
  readFileSync(path.join(bundleDir, f), "utf8"),
);

// 1. The id is present at all. Catches a build that read no mappings — the
//    only signal available on `local`, where the id is replica-allocated.
if (!sources.some((s) => s.includes(expectedId))) {
  console.error(
    `\n✗ Main canister id ${expectedId} is not baked into dist/bundle/*.js.` +
      `\n  It was read from ${mappingsFile}, so the define did not reach the bundle.\n`,
  );
  process.exit(1);
}

// 2. No define was left unreplaced. declarations/*/index.js reads
//    `process.env.CANISTER_ID_<NAME>`, and the catch-all `process.env` define
//    turns a missed key into a silent `undefined` rather than a build error.
//    A successful build leaves no occurrence of the name; a missed one does.
//
//    The keys are derived exactly as vite.config.ts derives them, covering both
//    spellings it defines, rather than pattern-matched, so a name that drifts out
//    of step with the mappings is caught rather than silently unchecked.
const defineKeys = Object.keys(canisterIds).flatMap((name) => {
  const upper = name.toUpperCase().replace(/-/g, "_");
  return [`CANISTER_ID_${upper}`, `${upper}_CANISTER_ID`];
});
const unreplaced = defineKeys.filter((key) => {
  const anchored = new RegExp(`(?<![A-Z0-9_])${key}(?![A-Z0-9_])`);
  return sources.some((s) => anchored.test(s));
});
if (unreplaced.length) {
  console.error(
    `\n✗ Unreplaced canister-id defines in dist/bundle/*.js: ${[...new Set(unreplaced)].join(", ")}.` +
      `\n  Those lookups resolve to undefined at runtime. Check the define keys in vite.config.ts` +
      `\n  against the names in ${mappingsFile}.\n`,
  );
  process.exit(1);
}
