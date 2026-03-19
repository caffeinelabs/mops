import { readFileSync, writeFileSync } from "node:fs";

// remove scripts
let text = readFileSync("dist/package.json", "utf8");
let json = JSON.parse(text);
delete json.scripts;

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
