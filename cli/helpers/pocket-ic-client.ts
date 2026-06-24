import semver from "semver";
import type { PocketIc, PocketIcServer } from "pic-ic";
import type {
  PocketIc as PocketIcModern,
  PocketIcServer as PocketIcServerModern,
  StartServerOptions,
} from "pic-js-mops";
import { readConfig } from "../mops.js";

export type AnyPocketIcServer = PocketIcServer | PocketIcServerModern;
export type AnyPocketIc = PocketIc | PocketIcModern;
export type AnySetupCanister = PocketIc["setupCanister"] &
  PocketIcModern["setupCanister"];

function isLegacy(): boolean {
  let version = readConfig().toolchain?.["pocket-ic"];
  return !!version && !!semver.valid(version) && semver.lt(version, "9.0.0");
}

export async function startPocketIc(
  options: StartServerOptions,
): Promise<{ server: AnyPocketIcServer; client: AnyPocketIc }> {
  // Imported lazily so commands that never start a replica don't load the
  // PocketIC client. `pic-js-mops` ships ESM without `type: module`, which a
  // static import fails to resolve under tsx (local dev); a dynamic import
  // resolves it on every platform.
  if (isLegacy()) {
    const { PocketIc, PocketIcServer } = await import("pic-ic");
    let server = await PocketIcServer.start(options);
    let client = await PocketIc.create(server.getUrl());
    return { server, client };
  }

  const { PocketIc, PocketIcServer } = await import("pic-js-mops");
  let server = await PocketIcServer.start(options);
  let client = await PocketIc.create(server.getUrl());
  return { server, client };
}
