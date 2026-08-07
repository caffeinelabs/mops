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
// `process.env.MAIN_CANISTER_ID` at build time and a catch-all `process.env`
// define turns a missed replacement into `undefined` at runtime — a bundle that
// builds green and cannot reach any canister.
//
// Assert the *expected* id, not any principal-shaped string: cli/api/network.ts
// hardcodes the ic and staging endpoint ids and the frontend bundles it, so a
// shape-only check passes even on a bundle built with no mappings at all.
const network = process.env["ICP_ENVIRONMENT"] || "local";
const mappingsFile = path.resolve(
  import.meta.dirname,
  network === "local"
    ? "../.icp/cache/mappings/local.ids.json"
    : `../.icp/data/mappings/${network}.ids.json`,
);

let expectedId;
try {
  expectedId = JSON.parse(readFileSync(mappingsFile, "utf8"))["main"];
} catch {
  // Left undefined — the failure below carries the useful message.
}

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
const hasId = bundles.some((f) =>
  readFileSync(path.join(bundleDir, f), "utf8").includes(`"${expectedId}"`),
);

if (!hasId) {
  console.error(
    `\n✗ Main canister id ${expectedId} is not baked into dist/bundle/*.js.` +
      `\n  It was read from ${mappingsFile}, so the define did not reach the bundle.\n`,
  );
  process.exit(1);
}
