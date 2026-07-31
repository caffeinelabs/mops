import semver from "semver";

export const MIN_MODERN_POCKET_IC_VERSION = "9.0.0";
export const MIN_DFINITY_CLIENT_POCKET_IC_VERSION = "9.0.0";

export function isLegacyPocketIcVersion(version: string | undefined): boolean {
  return (
    version !== undefined &&
    semver.valid(version) !== null &&
    semver.lt(version, MIN_MODERN_POCKET_IC_VERSION)
  );
}

export function assertDfinityClientSupportsPocketIc(
  version: string | undefined,
): void {
  if (!version || semver.valid(version) === null) {
    throw new Error(
      `PocketIC version ${JSON.stringify(version)} is invalid for test deployment. ` +
        "Use an exact semantic version. Run `mops toolchain use pocket-ic 12.0.0` to pin a supported version.",
    );
  }
  if (semver.lt(version, MIN_DFINITY_CLIENT_POCKET_IC_VERSION)) {
    throw new Error(
      `PocketIC ${version} is incompatible with test deployment. ` +
        `\`mops build --test-deploy\` requires pocket-ic ${MIN_DFINITY_CLIENT_POCKET_IC_VERSION} or newer. ` +
        "Run `mops toolchain use pocket-ic 12.0.0` to pin a supported version.",
    );
  }
}

export async function createClientOrStopServer<T>(
  server: { stop(): Promise<void> },
  createClient: () => Promise<T>,
): Promise<T> {
  try {
    return await createClient();
  } catch (error) {
    await server.stop().catch(() => {});
    throw error;
  }
}
