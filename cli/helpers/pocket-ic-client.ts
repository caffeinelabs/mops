import semver from "semver";
import { PocketIc, PocketIcServer } from "pic-ic";
import {
  PocketIc as PocketIcModern,
  PocketIcServer as PocketIcServerModern,
  type StartServerOptions,
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
  if (isLegacy()) {
    let server = await PocketIcServer.start(options);
    let client = await PocketIc.create(server.getUrl());
    return { server, client };
  }

  let server = await PocketIcServerModern.start(options);
  let client = await PocketIcModern.create(server.getUrl());
  return { server, client };
}
