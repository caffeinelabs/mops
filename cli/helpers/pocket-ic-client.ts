import semver from "semver";
import type { PocketIc, PocketIcServer } from "pic-ic";
import type {
  PocketIc as PocketIcModern,
  PocketIcServer as PocketIcServerModern,
  StartServerOptions,
} from "pic-js-mops";
import type { PocketIc as PocketIcDfinity } from "@dfinity/pic";
import { readConfig } from "../mops.js";

export type AnyPocketIcServer = PocketIcServer | PocketIcServerModern;
export type AnyPocketIc = PocketIc | PocketIcModern;
export type AnySetupCanister = PocketIc["setupCanister"] &
  PocketIcModern["setupCanister"];

type PocketIcResult = {
  server: AnyPocketIcServer;
  client: AnyPocketIc;
};

export const MIN_DFINITY_CLIENT_POCKET_IC_VERSION = "9.0.0";

function isLegacy(version: string | undefined): boolean {
  return (
    !!version &&
    !!semver.valid(version) &&
    semver.lt(version, MIN_DFINITY_CLIENT_POCKET_IC_VERSION)
  );
}

export function assertDfinityClientSupportsPocketIc(
  version: string | undefined,
): void {
  if (isLegacy(version)) {
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

export function startPocketIc(
  options: StartServerOptions,
  clientOptions: { client: "dfinity" },
): Promise<{ server: AnyPocketIcServer; client: PocketIcDfinity }>;
export function startPocketIc(
  options: StartServerOptions,
): Promise<PocketIcResult>;

export async function startPocketIc(
  options: StartServerOptions,
  {
    client: clientName = "versioned",
  }: {
    client?: "versioned" | "dfinity";
  } = {},
): Promise<
  PocketIcResult | { server: AnyPocketIcServer; client: PocketIcDfinity }
> {
  const version = readConfig().toolchain?.["pocket-ic"];
  if (clientName === "dfinity") {
    assertDfinityClientSupportsPocketIc(version);
  }

  // Imported lazily so commands that never start a replica don't load the
  // PocketIC client. `pic-js-mops` ships ESM without `type: module`, which a
  // static import fails to resolve under tsx (local dev); a dynamic import
  // resolves it on every platform.
  if (isLegacy(version)) {
    const { PocketIc, PocketIcServer } = await import("pic-ic");
    let server = await PocketIcServer.start(options);
    let client = await createClientOrStopServer(server, () =>
      PocketIc.create(server.getUrl()),
    );
    return { server, client };
  }

  const { PocketIc, PocketIcServer } = await import("pic-js-mops");
  let server = await PocketIcServer.start(options);
  if (clientName === "dfinity") {
    const { PocketIc: PocketIcDfinity } = await import("@dfinity/pic");
    const client = await createClientOrStopServer(server, () =>
      PocketIcDfinity.create(server.getUrl()),
    );
    return { server, client };
  }
  let client = await createClientOrStopServer(server, () =>
    PocketIc.create(server.getUrl()),
  );
  return { server, client };
}
