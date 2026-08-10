import type { ChildProcess } from "node:child_process";
import type {
  PocketIc,
  PocketIcServer,
  StartServerOptions,
} from "@dfinity/pic";

export type { PocketIc, PocketIcServer, StartServerOptions };

// A server whose client never came up is an orphaned process: nothing holds a
// handle to stop it later, so it must be stopped here.
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

export async function startPocketIc(
  options: StartServerOptions,
): Promise<{ server: PocketIcServer; client: PocketIc }> {
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
