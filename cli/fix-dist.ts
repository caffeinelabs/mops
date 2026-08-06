import { readFileSync, writeFileSync } from "node:fs";

// remove scripts
let text = readFileSync("dist/package.json", "utf8");
let json = JSON.parse(text);
delete json.scripts;

// `files` is an allowlist relative to cli/, so inheriting it here would pack
// almost nothing when dist/ is installed directly (`npm i -g ./cli/dist`).
delete json.files;

// dist/bin/cli.js -> bin/cli.js
json.bin.mops = "bin/mops.js";
json.bin["ic-mops"] = "bin/mops.js";

writeFileSync("dist/package.json", JSON.stringify(json, null, 2));

// Route the npm entry point through the Node.js environment wrapper
// so setWasmBindings() is called before the CLI runs.
// The source bin/mops.js imports ../cli.js (needed for the single-file bundle),
// but dist/ has the full directory structure with environments/nodejs/cli.js.
writeFileSync(
  "dist/bin/mops.js",
  '#!/usr/bin/env node\n\nimport "../environments/nodejs/cli.js";\n',
);

// `@dfinity/pic` is a devDependency, pre-bundled into dist/vendor/pic.mjs by
// `vendor:pic`. Keeping it out of `dependencies` is what stops its postinstall
// from downloading a 90+ MB pocket-ic binary on every `npm i -g ic-mops` —
// mops manages the pocket-ic binary itself via `[toolchain]`.
let picClientPath = "dist/helpers/pocket-ic-client.js";
let picClient = readFileSync(picClientPath, "utf8");
if (!picClient.includes('import("@dfinity/pic")')) {
  throw new Error(`${picClientPath}: no '@dfinity/pic' import to rewrite`);
}
writeFileSync(
  picClientPath,
  picClient.replaceAll('import("@dfinity/pic")', 'import("../vendor/pic.mjs")'),
);
