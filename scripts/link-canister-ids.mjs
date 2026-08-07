// Records the canister IDs from canister_ids.json in icp-cli's ID store.
//
// icp-cli 1.2.0 has no way to declare a canister ID in icp.yaml. IDs live in
// an untracked store, so a fresh checkout — every CI run, and every clone —
// starts with none, and a deploy without `--no-create` would happily create a
// brand new canister instead of upgrading the real one. Linking first is the
// supported way to point the store at existing canisters, and keeps
// canister_ids.json the single source of truth.
//
// Usage: node scripts/link-canister-ids.mjs <environment> [canister...]

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const [environment, ...requested] = process.argv.slice(2);

if (!environment) {
  console.error(
    "Usage: node scripts/link-canister-ids.mjs <environment> [canister...]",
  );
  process.exit(1);
}

const icp = (args, quiet = false) =>
  execFileSync("icp", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", quiet ? "pipe" : "inherit"],
  });

// The environment decides which canisters exist, so ask icp-cli rather than
// re-parsing icp.yaml. `staging` declares only main and assets.
let declared;
try {
  declared = new Set(
    JSON.parse(icp(["canister", "list", "--json", "-e", environment]))
      .canisters,
  );
} catch (e) {
  // Surface the cause: an `icp` missing from PATH raises ENOENT with no stderr
  // of its own, and a bare message sends a fresh clone hunting the wrong thing.
  console.error(
    `Could not list canisters in the ${environment} environment: ${e instanceof Error ? e.message : e}`,
  );
  process.exit(1);
}

const ids = JSON.parse(
  readFileSync(new URL("../canister_ids.json", import.meta.url), "utf8"),
);

// Default to what the environment declares, not to every key in
// canister_ids.json — that file also carries IDs for canisters this project
// does not declare (dao-*, play-backend), which are not ours to link.
const names = requested.length ? requested : [...declared];

for (const name of names) {
  if (!declared.has(name)) {
    console.error(`${name} is not declared in the ${environment} environment`);
    process.exit(1);
  }

  const id = ids[name]?.[environment];
  if (!id) {
    if (requested.length) {
      console.error(`canister_ids.json has no ${environment} ID for ${name}`);
      process.exit(1);
    }
    console.log(`skip  ${name} — no ${environment} ID in canister_ids.json`);
    continue;
  }

  // A bare --force fails when no mapping exists yet, which is every fresh
  // checkout, so link plainly first and fall back for reruns. The first
  // attempt is silenced: on a rerun it fails by design, and letting it print
  // makes a healthy run look broken.
  try {
    icp(["canister", "link", name, id, "-e", environment], true);
  } catch {
    icp(["canister", "link", name, id, "-e", environment, "--force"], true);
  }
  console.log(`link  ${name} -> ${id} (${environment})`);
}
