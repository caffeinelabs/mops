import { Actor, HttpAgent, Identity } from "@icp-sdk/core/agent";
import { IDL } from "@icp-sdk/core/candid";
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
      // No eager syncTime: it costs three read_state calls to an unrelated
      // canister on every invocation. The agent syncs lazily instead, on the
      // first IngressExpiryInvalid response.
      shouldSyncTime: false,
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

// Calls a `oneway` method on the main canister. A `oneway` method has no reply,
// but `Actor` still routes it through the update path and blocks on the certified
// result (~2s). Submitting to the v2 call endpoint instead returns as soon as the
// replica accepts the ingress message, which is all the delivery guarantee a
// `oneway` call ever had.
export let mainOnewayCall = async <M extends keyof _SERVICE & string>(
  methodName: M,
  args: Parameters<_SERVICE[M]>,
): Promise<void> => {
  let agent = await getAgent();
  let canisterId = getEndpoint(getNetwork()).canisterId;
  let func = idlFactory({ IDL }).fieldsAsObject()[methodName];

  if (!func) {
    throw new Error(`Unknown main canister method "${methodName}"`);
  }

  await agent.call(canisterId, {
    methodName,
    arg: IDL.encode(func.argTypes, args),
    effectiveCanisterId: canisterId,
    callSync: false,
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
