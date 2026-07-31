import type { PocketIc, PocketIcServer } from "pic-ic";
import type {
  PocketIc as PocketIcModern,
  PocketIcServer as PocketIcServerModern,
  StartServerOptions,
} from "pic-js-mops";
// TODO: switch to pic-js-mops@0.22.0 once released — same client without
// @dfinity/pic's postinstall (unverified 98 MB binary download at install
// time, hard failure on Windows). See pic-js-mops@0.14.8 for the precedent.
import type { PocketIc as PocketIcDfinity } from "@dfinity/pic";
import { readConfig } from "../mops.js";
import {
  assertDfinityClientSupportsPocketIc,
  createClientOrStopServer,
  isLegacyPocketIcVersion,
} from "./pocket-ic-startup.js";

export type AnyPocketIcServer = PocketIcServer | PocketIcServerModern;
export type AnyPocketIc = PocketIc | PocketIcModern;
export type AnySetupCanister = PocketIc["setupCanister"] &
  PocketIcModern["setupCanister"];

type PocketIcResult = {
  server: AnyPocketIcServer;
  client: AnyPocketIc;
};

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
  const { PocketIc, PocketIcServer } = isLegacyPocketIcVersion(version)
    ? await import("pic-ic")
    : await import("pic-js-mops");
  const server = await PocketIcServer.start(options);

  if (clientName === "dfinity") {
    // TODO: import from pic-js-mops@0.22.0 once released (see note above).
    const { PocketIc: PocketIcDfinity } = await import("@dfinity/pic");
    const client = await createClientOrStopServer(server, () =>
      PocketIcDfinity.create(server.getUrl()),
    );
    return { server, client };
  }
  const client = await createClientOrStopServer<AnyPocketIc>(server, () =>
    PocketIc.create(server.getUrl()),
  );
  return { server, client };
}
