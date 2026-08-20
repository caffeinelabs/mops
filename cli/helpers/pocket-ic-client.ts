import type { ChildProcess } from "node:child_process";
import type {
  PocketIc,
  PocketIcServer,
  StartServerOptions,
} from "@dfinity/pic";
import { readConfig } from "../mops.js";
import {
  createClientOrStopServer,
  getPocketIcUrl,
  trackAttachedPocketIc,
  warnIgnoredPocketIcPin,
} from "./pocket-ic-startup.js";

export type { PocketIc, PocketIcServer, StartServerOptions };

function pinnedPocketIcVersion(): string | undefined {
  return readConfig().toolchain?.["pocket-ic"];
}

// Server options may be a thunk so the spawn-only work behind them (resolving
// `toolchain.bin("pocket-ic")` downloads the binary) is never paid in attached
// mode, where the whole object is unused.
export type StartServerOptionsSource =
  | StartServerOptions
  | (() => Promise<StartServerOptions>);

export async function startPocketIc(
  optionsSource: StartServerOptionsSource,
): Promise<{ server?: PocketIcServer; client: PocketIc }> {
  const url = getPocketIcUrl();
  if (url) {
    warnIgnoredPocketIcPin(pinnedPocketIcVersion);
    const { PocketIc } = await import("@dfinity/pic");
    let client: PocketIc;
    try {
      client = await PocketIc.create(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Cannot connect to the PocketIC server at MOPS_POCKET_IC_URL (${url}): ${message}\n` +
          "Check that the server is running, the URL points at the PocketIC control API " +
          "(not the IC HTTP gateway), and the server version is compatible with the bundled `@dfinity/pic` client.",
        { cause: error },
      );
    }
    trackAttachedPocketIc(client);
    return { client };
  }

  const options =
    typeof optionsSource === "function" ? await optionsSource() : optionsSource;

  // Imported lazily so commands that never start a replica don't load the
  // PocketIC client (and its `@icp-sdk/core` dependency).
  //
  // `@dfinity/pic` is a devDependency pre-bundled into dist/vendor/pic.mjs;
  // `fix-dist` rewrites this specifier — and only this one — to the bundle.
  const { PocketIc, PocketIcServer } = await import("@dfinity/pic");
  let server = await PocketIcServer.start(options);
  let client = await createClientOrStopServer(server, () =>
    PocketIc.create(server.getUrl()),
  );
  return { server, client };
}

// `serverProcess` is TS-private upstream but exists at runtime; mops reads its
// stderr to stream canister logs. Narrow cast instead of patching the package.
export function serverStderr(server: PocketIcServer): ChildProcess["stderr"] {
  return (server as unknown as { serverProcess: ChildProcess }).serverProcess
    .stderr;
}
