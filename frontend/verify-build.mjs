import { existsSync } from "node:fs";
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
