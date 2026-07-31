import semver from "semver";
import type {
  PocketIc as PocketIcLegacy,
  PocketIcServer as PocketIcServerLegacy,
} from "pic-ic";
import type { PocketIc } from "@dfinity/pic";
import { readConfig } from "../mops.js";
import {
  MopsPocketIcServer,
  type StartPocketIcServerOptions,
} from "./pocket-ic-server.js";

export type AnyPocketIcServer = PocketIcServerLegacy | MopsPocketIcServer;
export type AnyPocketIc = PocketIcLegacy | PocketIc;
export type AnySetupCanister = PocketIcLegacy["setupCanister"] &
  PocketIc["setupCanister"];

function isLegacy(): boolean {
  let version = readConfig().toolchain?.["pocket-ic"];
  return !!version && !!semver.valid(version) && semver.lt(version, "9.0.0");
}

export async function addPocketIcCycles(
  client: AnyPocketIc,
  canisterId: unknown,
  amount: bigint,
): Promise<void> {
  if (isLegacy()) {
    await (client as PocketIcLegacy).addCycles(
      canisterId as Parameters<PocketIcLegacy["addCycles"]>[0],
      Number(amount),
    );
    return;
  }
  await (client as PocketIc).addCycles(
    canisterId as Parameters<PocketIc["addCycles"]>[0],
    amount,
  );
}

export async function startPocketIc(
  options: StartPocketIcServerOptions,
): Promise<{ server: AnyPocketIcServer; client: AnyPocketIc }> {
  if (isLegacy()) {
    const { PocketIc, PocketIcServer } = await import("pic-ic");
    let server = await PocketIcServer.start(options);
    try {
      let client = await PocketIc.create(server.getUrl());
      return { server, client };
    } catch (error) {
      await server.stop();
      throw error;
    }
  }

  // Imported lazily so commands that never start a replica do not load the
  // PocketIC client or its @icp-sdk/core v5 dependency.
  const { PocketIc } = await import("@dfinity/pic");
  let server = await MopsPocketIcServer.start(options);
  try {
    let client = await PocketIc.create(server.getUrl());
    return { server, client };
  } catch (error) {
    await server.stop();
    throw error;
  }
}
