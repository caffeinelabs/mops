import { Actor, HttpAgent, Identity } from "@icp-sdk/core/agent";
import { Principal } from "@icp-sdk/core/principal";

import { _SERVICE, idlFactory } from "../declarations/main/main.did.js";
import { idlFactory as storageIdlFactory } from "../declarations/storage/storage.did.js";
import { _SERVICE as _STORAGE_SERVICE } from "../declarations/storage/storage.did.js";

import { getEndpoint } from "./network.js";
import { getNetwork } from "./network.js";

let agentPromiseByPrincipal = new Map<string, Promise<HttpAgent>>();

let getAgent = async (identity?: Identity): Promise<HttpAgent> => {
  let principal = identity ? identity?.getPrincipal().toText() : "";
  let agentPromise = agentPromiseByPrincipal.get(principal);

  if (!agentPromise) {
    let network = getNetwork();
    let host = getEndpoint(network).host;

    agentPromise = HttpAgent.create({
      host,
      identity,
      shouldFetchRootKey: network === "local",
      verifyQuerySignatures:
        process.env.MOPS_VERIFY_QUERY_SIGNATURES !== "false",
      shouldSyncTime: true,
    });

    agentPromiseByPrincipal.set(principal, agentPromise);
  }

  return agentPromise;
};

export let mainActor = async (identity?: Identity): Promise<_SERVICE> => {
  let agent = await getAgent(identity);
  let network = getNetwork();
  let canisterId = getEndpoint(network).canisterId;

  return Actor.createActor(idlFactory, {
    agent,
    canisterId,
  });
};

export let storageActor = async (
  storageId: Principal,
  identity?: Identity,
): Promise<_STORAGE_SERVICE> => {
  let agent = await getAgent(identity);

  return Actor.createActor(storageIdlFactory, {
    agent,
    canisterId: storageId,
  });
};
