export function getNetwork() {
  return process.env["MOPS_NETWORK"] || globalThis.MOPS_NETWORK || "ic";
}

export function getEndpoint(network: string) {
  let endpoint: { host: string; canisterId: string };
  if (network === "staging") {
    endpoint = {
      host: "https://icp-api.io",
      canisterId: "2d2zu-vaaaa-aaaak-qb6pq-cai",
    };
  } else if (network === "ic") {
    endpoint = {
      host: "https://icp-api.io",
      canisterId: "oknww-riaaa-aaaam-qaf6a-cai",
    };
  } else {
    endpoint = {
      host: "http://127.0.0.1:4943",
      canisterId: "2d2zu-vaaaa-aaaak-qb6pq-cai",
    };
  }

  const hostOverride = process.env["MOPS_REGISTRY_HOST"]?.trim();
  const canisterOverride = process.env["MOPS_REGISTRY_CANISTER_ID"]?.trim();
  return {
    host: hostOverride || endpoint.host,
    canisterId: canisterOverride || endpoint.canisterId,
  };
}
