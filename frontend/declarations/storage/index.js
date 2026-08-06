import { Actor, HttpAgent } from "@icp-sdk/core/agent";

// Imports and re-exports candid interface
import { idlFactory } from './storage.did.js';
export { idlFactory } from './storage.did.js';

/**
 *
 * @param {string | import("@icp-sdk/core/principal").Principal} canisterId Canister ID of Agent
 * @param {{agentOptions?: import("@icp-sdk/core/agent").HttpAgentOptions; actorOptions?: import("@icp-sdk/core/agent").ActorConfig}} [options]
 * @return {import("@icp-sdk/core/agent").ActorSubclass<import("./storage.did.js")._SERVICE>}
 */
 export const createActor = (canisterId, options) => {
  const agent = new HttpAgent({ ...options?.agentOptions });

  // Fetch root key for certificate validation during development
  if(process.env.NODE_ENV !== "production") {
    agent.fetchRootKey().catch(err=>{
      console.warn("Unable to fetch root key. Check to ensure that your local replica is running");
      console.error(err);
    });
  }

  // Creates an actor with using the candid interface and the HttpAgent
  return Actor.createActor(idlFactory, {
    agent,
    canisterId,
    ...options?.actorOptions,
  });
};