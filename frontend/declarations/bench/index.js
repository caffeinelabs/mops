// Hand-maintained. `npm run decl` regenerates only the sibling *.did* files.

import { Actor, HttpAgent } from "@icp-sdk/core/agent";

// Imports and re-exports candid interface
import { idlFactory } from "./bench.did.js";
export { idlFactory } from "./bench.did.js";

// Substituted at build time by the frontend bundler (see frontend/vite.config.ts).
export const canisterId =
  process.env.CANISTER_ID_BENCH;

export const createActor = (canisterId, options = {}) => {
  const agent = options.agent || new HttpAgent({ ...options.agentOptions });

  if (options.agent && options.agentOptions) {
    console.warn(
      "Detected both agent and agentOptions passed to createActor. Ignoring agentOptions and proceeding with the provided agent."
    );
  }

  // Only a local replica. Fetching it from a remote boundary node means
  // trusting the endpoint we are trying to verify. Matches storage/index.js;
  // vite sets NODE_ENV=production for every non-local network.
  if (process.env.NODE_ENV !== "production") {
    agent.fetchRootKey().catch((err) => {
      console.warn(
        "Unable to fetch root key. Check to ensure that your local replica is running"
      );
      console.error(err);
    });
  }

  // Creates an actor with using the candid interface and the HttpAgent
  return Actor.createActor(idlFactory, {
    agent,
    canisterId,
    ...options.actorOptions,
  });
};
