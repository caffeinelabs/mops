import { isRegistryFallbackEnabled } from "./network.js";

const fallbackPackages = new Set<string>();

export function isFallbackActive(): boolean {
  return isRegistryFallbackEnabled();
}

export function markPackageAsFallback(pkg: string): void {
  fallbackPackages.add(pkg);
}

export function isPackageFallback(pkg: string): boolean {
  return fallbackPackages.has(pkg);
}

export async function getMainActorForPkg(
  pkg: string,
): Promise<import("../declarations/main/main.did.js")._SERVICE> {
  const { defaultMainActor, mainActor } = await import("./actors.js");
  return isPackageFallback(pkg) ? defaultMainActor() : mainActor();
}

export async function getStorageActorForPkg(
  pkg: string,
  storageId: import("@icp-sdk/core/principal").Principal,
): Promise<import("../declarations/storage/storage.did.js")._SERVICE> {
  const { defaultStorageActor, storageActor } = await import("./actors.js");
  return isPackageFallback(pkg)
    ? defaultStorageActor(storageId)
    : storageActor(storageId);
}

export function _resetFallbackPackagesForTesting(): void {
  fallbackPackages.clear();
}
