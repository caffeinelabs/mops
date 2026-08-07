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
const bundleDir = path.join(dist, "bundle");
const bundles = existsSync(bundleDir)
  ? readdirSync(bundleDir).filter((f) => f.endsWith(".js"))
  : [];
const principal = /"[a-z0-9]{5}(?:-[a-z0-9]{5}){3,}-[a-z0-9]{3}"/;
const hasId = bundles.some((f) =>
  principal.test(readFileSync(path.join(bundleDir, f), "utf8")),
);

if (!hasId) {
  console.error(
    `\n✗ No canister id found in dist/bundle/*.js.` +
      `\n  The build could not read canister ids, so every lookup resolves to undefined.` +
      `\n  Locally, run: npm run deploy-local\n`,
  );
  process.exit(1);
}
