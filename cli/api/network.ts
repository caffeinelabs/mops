export function getNetwork() {
  return globalThis.MOPS_NETWORK || "ic";
}

export function getEndpoint(network: string) {
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
