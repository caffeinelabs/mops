import type { ChildProcess } from "node:child_process";
import semver from "semver";
import type {
  PocketIc as PocketIcLegacy,
  PocketIcServer as PocketIcServerLegacy,
} from "pic-ic";
import type {
  PocketIc,
  PocketIcServer,
  StartServerOptions,
} from "@dfinity/pic";
import { readConfig } from "../mops.js";
import { warnLegacyPocketIc } from "./deprecate-legacy-pocket-ic.js";
import {
  assertDfinityClientSupportsPocketIc,
  createClientOrStopServer,
  getPocketIcUrl,
  trackAttachedPocketIc,
  warnIgnoredPocketIcPin,
} from "./pocket-ic-startup.js";

// Both packages declare the same `StartServerOptions` fields, so one type covers
// both clients.
export type { StartServerOptions };

type PocketIcResult = {
  server?: AnyPocketIcServer;
  client: AnyPocketIc;
};

// `pic-ic` is the only client that can talk to a pocket-ic server older than
// 9.0.0. It is deprecated and goes away in v3 (NEXT-MAJOR.md), but until then
// both clients are in play, so anything holding a client is typed as a union.
export type AnyPocketIcServer = PocketIcServerLegacy | PocketIcServer;
export type AnyPocketIc = PocketIcLegacy | PocketIc;

// The two `setupCanister` signatures differ (option fields, generic constraint,
// `Principal` package) but accept the same argument shape at runtime, so callers
// pick an overload through this intersection instead of branching.
export type AnySetupCanister = PocketIcLegacy["setupCanister"] &
  PocketIc["setupCanister"];

type LegacyPrincipal = Parameters<PocketIcLegacy["addCycles"]>[0];
type ModernPrincipal = Parameters<PocketIc["addCycles"]>[0];

function pinnedPocketIcVersion(): string | undefined {
  return readConfig().toolchain?.["pocket-ic"];
}

// The pinned version when it selects the legacy client, otherwise undefined.
function legacyVersion(): string | undefined {
  let version = pinnedPocketIcVersion();
  if (version && semver.valid(version) && semver.lt(version, "9.0.0")) {
    return version;
  }
  return undefined;
}

export function startPocketIc(
  options: StartServerOptions,
  clientOptions: { client: "dfinity" },
): Promise<{ server?: PocketIcServer; client: PocketIc }>;
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
): Promise<PocketIcResult | { server?: PocketIcServer; client: PocketIc }> {
  const url = getPocketIcUrl();
  if (url) {
    warnIgnoredPocketIcPin(pinnedPocketIcVersion());
    const { PocketIc } = await import("@dfinity/pic");
    const client = await PocketIc.create(url);
    trackAttachedPocketIc(client);
    return { client };
  }

  const version = pinnedPocketIcVersion();
  if (clientName === "dfinity") {
    assertDfinityClientSupportsPocketIc(version);
  }

  // Imported lazily so commands that never start a replica don't load the
  // PocketIC client (and its `@icp-sdk/core` dependency).
  let legacy = legacyVersion();
  if (legacy && clientName === "versioned") {
    warnLegacyPocketIc(legacy);
    const { PocketIc, PocketIcServer } = await import("pic-ic");
    let server = await PocketIcServer.start(options);
    let client = await createClientOrStopServer(server, () =>
      PocketIc.create(server.getUrl()),
    );
    return { server, client };
  }

  // `@dfinity/pic` is a devDependency pre-bundled into dist/vendor/pic.mjs;
  // `fix-dist` rewrites this specifier — and only this one — to the bundle.
  const { PocketIc, PocketIcServer } = await import("@dfinity/pic");
  let server = await PocketIcServer.start(options);
  let client = await createClientOrStopServer(server, () =>
    PocketIc.create(server.getUrl()),
  );
  return { server, client };
}

// `serverProcess` is public on `pic-ic` and TS-private upstream, but exists at
// runtime on both; mops reads its stderr to stream canister logs. Narrow cast
// instead of patching the package.
export function serverStderr(
  server: AnyPocketIcServer,
): ChildProcess["stderr"] {
  return (server as unknown as { serverProcess: ChildProcess }).serverProcess
    .stderr;
}

// `pic-ic` takes the amount as a `number` and upstream as a `bigint`, so unlike
// `setupCanister` this cannot be bridged by a cast — the value itself differs.
// Branch on the same pin that picked the client.
export async function addCycles(
  client: AnyPocketIc,
  canisterId: LegacyPrincipal | ModernPrincipal,
  amount: bigint,
): Promise<void> {
  if (legacyVersion() && !getPocketIcUrl()) {
    // 1e12 cycles is well inside Number.MAX_SAFE_INTEGER.
    await (client as PocketIcLegacy).addCycles(
      canisterId as LegacyPrincipal,
      Number(amount),
    );
    return;
  }
  await (client as PocketIc).addCycles(canisterId as ModernPrincipal, amount);
}
