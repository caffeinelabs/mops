declare global {
	// Write side: components/package/Package.svelte sets this on `window`.
	interface Window {
		MOPS_NETWORK : string;
	}
	// Read side: ic-mops/api/network.ts reads it via `globalThis`.
	// Both declarations are needed — keep them in sync.
	// eslint-disable-next-line no-var
	var MOPS_NETWORK: string;
}

export {};