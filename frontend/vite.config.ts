import fs from "node:fs";
import path from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const NETWORKS = ["ic", "local", "staging"] as const;
type Network = (typeof NETWORKS)[number];

// Required, with no default. Defaulting to `local` meant a build that forgot to
// set it baked the local replica's ids while looking entirely successful — and
// `icp deploy assets -e ic` run by hand sets nothing, so that was one typo away
// from uploading a local-id bundle to mainnet. The dev server passes the value
// explicitly (see frontend/package.json).
const network = process.env["ICP_ENVIRONMENT"] as Network | undefined;
if (!network || !NETWORKS.includes(network)) {
  throw new Error(
    `ICP_ENVIRONMENT must be one of ${NETWORKS.join(", ")}` +
      `${network ? `, got "${network}"` : " (unset)"}.` +
      `\nDeploy with npm run deploy-local / deploy-staging / deploy-ic, which set it.`,
  );
}

// icp-cli stores ids per environment as a flat { name: id } map. Managed
// networks (local) land in .icp/cache/, connected ones in .icp/data/, which is
// committed so a fresh checkout can build against mainnet. Resolved against
// this file, not cwd, so it does not matter where vite is invoked from.
const mappingsFile = path.resolve(
  import.meta.dirname,
  network === "local"
    ? "../.icp/cache/mappings/local.ids.json"
    : `../.icp/data/mappings/${network}.ids.json`,
);

let canisterIds: Record<string, string> = {};
try {
  canisterIds = JSON.parse(fs.readFileSync(mappingsFile).toString());
} catch (e) {
  // Only local may proceed without ids — that is the "not deployed yet" case,
  // and the dev server is still useful. For staging or ic a missing id yields a
  // bundle whose every canister lookup is undefined: it builds green and cannot
  // reach anything once deployed.
  if (network !== "local") {
    throw new Error(
      `Could not read canister ids from ${mappingsFile}: ${e instanceof Error ? e.message : e}`,
    );
  }
  console.error(
    "\n⚠️  Before starting the dev server run: npm run deploy-local\n\n",
  );
}

// Baked into the bundle for the hand-maintained actor factories in
// declarations/*/index.js. This strange way of JSON.stringifying the value is
// required by vite.
const canisterDefinitions = Object.entries(canisterIds).reduce(
  (acc, [key, id]) => ({
    ...acc,
    [`process.env.${key.toUpperCase().replace(/-/g, "_")}_CANISTER_ID`]:
      JSON.stringify(id),
    [`process.env.CANISTER_ID_${key.toUpperCase().replace(/-/g, "_")}`]:
      JSON.stringify(id),
  }),
  {},
);

// Matches the local network's gateway port in icp.yaml.
const LOCAL_REPLICA_PORT = "4943";

// See guide on how to configure Vite at:
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    viteStaticCopy({
      targets: [
        {
          src: "external/*",
          dest: ".",
        },
        {
          src: ".ic-assets.json",
          dest: ".",
        },
        {
          src: ".well-known/*",
          dest: ".",
        },
      ],
    }),
  ],
  build: {
    target: ["es2020"],
    lib: {
      entry: "./index.html",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["img", "external"],
      output: {
        entryFileNames: "bundle/[name]-[hash:20].js",
        chunkFileNames: "bundle/[name]-[hash:20].js",
        assetFileNames: "bundle/[name]-[hash:20].[ext]",
      },
    },
  },
  server: {
    watch: {
      usePolling: true,
    },
    fs: {
      allow: ["."],
    },
    proxy: {
      // Proxies all http requests made to /api to the local replica
      "/api": {
        // target: 'https://icp-api.io/',
        target: `http://127.0.0.1:${LOCAL_REPLICA_PORT}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "/api"),
      },
    },
  },
  define: {
    // Here we can define global constants
    // Required because the actor factories in declarations/ read process.env
    ...canisterDefinitions,
    // The resolved value, not the raw env var: baking `undefined` here while
    // the ids above came from the local replica let the two disagree.
    "process.env.ICP_ENVIRONMENT": JSON.stringify(network),
    "process.env.NODE_ENV": JSON.stringify(
      network === "local" ? "development" : "production",
    ),
    // Catch-all fallback: Vite replaces longest keys first, so specific process.env.X entries above take priority
    "process.env": "({})",
  },
});
