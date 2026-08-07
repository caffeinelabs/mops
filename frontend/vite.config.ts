import fs from "node:fs";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

type Network = "ic" | "local" | "staging";
let network = (process.env["ICP_ENVIRONMENT"] as Network) || "local";

interface CanisterIds {
  /* eslint-disable-next-line no-unused-vars */
  [key: string]: { [key in Network]: string };
}

let canisterIds: CanisterIds = {};
try {
  if (network === "local") {
    // The local replica allocates ids at create time, so they come from
    // icp-cli's store rather than canister_ids.json. Flat { name: id } there,
    // keyed by network here.
    const icpIds = JSON.parse(
      fs.readFileSync("../.icp/cache/mappings/local.ids.json").toString(),
    ) as Record<string, string>;
    canisterIds = Object.fromEntries(
      Object.entries(icpIds).map(([name, id]) => [
        name,
        { local: id } as { [k in Network]: string },
      ]),
    );
  } else {
    canisterIds = JSON.parse(
      fs.readFileSync("../canister_ids.json").toString(),
    );
  }
} catch (e) {
  // Only local is allowed to proceed without ids — that is the "you have not
  // deployed yet" case, and the dev server is useful anyway. For staging or ic
  // a missing id silently yields a bundle whose every canister lookup is
  // undefined, which builds green and cannot reach anything once deployed.
  if (network !== "local") {
    throw new Error(
      `Could not read canister ids for the '${network}' network: ${e instanceof Error ? e.message : e}`,
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
  (acc, [key, val]) => ({
    ...acc,
    [`process.env.${key.toUpperCase().replace(/-/g, "_")}_CANISTER_ID`]:
      JSON.stringify(val[network as Network]),
    [`process.env.CANISTER_ID_${key.toUpperCase().replace(/-/g, "_")}`]:
      JSON.stringify(val[network as Network]),
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
