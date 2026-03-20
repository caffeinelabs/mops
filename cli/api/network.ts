export function getNetwork() {
  return globalThis.MOPS_NETWORK || "ic";
}

export type Endpoint = { host: string; canisterId: string };

export function getDefaultEndpoint(network: string): Endpoint {
  if (network === "staging") {
    return {
      host: "https://icp-api.io",
      canisterId: "2d2zu-vaaaa-aaaak-qb6pq-cai",
    };
  } else if (network === "ic") {
    return {
      host: "https://icp-api.io",
      canisterId: "oknww-riaaa-aaaam-qaf6a-cai",
    };
  } else {
    return {
      host: "http://127.0.0.1:4943",
      canisterId: "2d2zu-vaaaa-aaaak-qb6pq-cai",
    };
  }
}

export function getEndpoint(network: string): Endpoint {
  let endpoint = getDefaultEndpoint(network);

  const hostOverride = process.env["MOPS_REGISTRY_HOST"]?.trim();
  const canisterOverride = process.env["MOPS_REGISTRY_CANISTER_ID"]?.trim();
  return {
    host: hostOverride || endpoint.host,
    canisterId: canisterOverride || endpoint.canisterId,
  };
}

export function hasCustomRegistry(): boolean {
  return !!process.env["MOPS_REGISTRY_HOST"]?.trim();
}

export function isRegistryFallbackEnabled(): boolean {
  return hasCustomRegistry() && !!process.env["MOPS_REGISTRY_FALLBACK"]?.trim();
}
