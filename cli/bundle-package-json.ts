import { readFileSync, writeFileSync } from "node:fs";

let packageJson = JSON.parse(readFileSync("./bundle/package.json", "utf8"));

packageJson.bin.mops = "bin/mops.js";
packageJson.bin["ic-mops"] = "bin/mops.js";

delete packageJson.scripts;
delete packageJson.devDependencies;
delete packageJson.overrides;

// `files` is an allowlist relative to cli/, so inheriting it here would pack
// almost nothing when bundle/ is installed directly (`npm i -g ./bundle`).
delete packageJson.files;
packageJson.dependencies = {
  "dhall-to-json-cli": packageJson.dependencies["dhall-to-json-cli"],
  "decomp-tarxz": packageJson.dependencies["decomp-tarxz"],
  buffer: packageJson.dependencies["buffer"],
};

writeFileSync("./bundle/package.json", JSON.stringify(packageJson, null, "  "));
