import chalk from "chalk";
import semver from "semver";
import { FILE_PATH_REGEX } from "../constants.js";

export const MIN_DFINITY_CLIENT_POCKET_IC_VERSION = "9.0.0";

let ignoredPinWarned = false;

export function getPocketIcUrl(): string | undefined {
  const raw = process.env.MOPS_POCKET_IC_URL?.trim();
  if (!raw) {
    return undefined;
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      `MOPS_POCKET_IC_URL is not a valid URL: ${JSON.stringify(raw)}`,
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `MOPS_POCKET_IC_URL must be an http or https URL, got ${JSON.stringify(parsed.protocol)}`,
    );
  }
  return raw.replace(/\/+$/, "");
}

export function hasPocketIcSource(pin: string | undefined): boolean {
  return Boolean(getPocketIcUrl() || pin);
}

export function warnIgnoredPocketIcPin(version: string | undefined): void {
  if (!version || ignoredPinWarned) {
    return;
  }
  ignoredPinWarned = true;
  console.log(
    chalk.yellow(
      `\`MOPS_POCKET_IC_URL\` is set; the \`pocket-ic\` pin (${version}) in \`[toolchain]\` is ignored for this run.\n` +
        "Unset `MOPS_POCKET_IC_URL` to use the pinned binary.",
    ),
  );
}

export function assertDfinityClientSupportsPocketIc(
  version: string | undefined,
): void {
  if (version?.match(FILE_PATH_REGEX)) {
    return;
  }
  if (!version || semver.valid(version) === null) {
    throw new Error(
      `PocketIC version ${JSON.stringify(version)} is invalid for deployment checks. ` +
        "Use an exact semantic version. Run `mops toolchain use pocket-ic 15.0.0` to pin a supported version.",
    );
  }
  if (semver.lt(version, MIN_DFINITY_CLIENT_POCKET_IC_VERSION)) {
    throw new Error(
      `PocketIC ${version} is incompatible with deployment checks. ` +
        `\`mops build --check-deploy\` requires pocket-ic ${MIN_DFINITY_CLIENT_POCKET_IC_VERSION} or newer. ` +
        "Run `mops toolchain use pocket-ic 15.0.0` to pin a supported version.",
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

// A local spawn can skip instance DELETE on SIGINT because killing the process
// takes the instances with it. An attached server outlives this process, so the
// instance we created must be deleted or it leaks.
export async function stopPocketIc(
  {
    client,
    server,
  }: {
    client?: { tearDown(): Promise<void> };
    server?: { stop(): Promise<void> };
  },
  { sigint = false } = {},
): Promise<void> {
  if (!client) {
    return;
  }
  attachedClients.delete(client);
  if (!sigint || !server) {
    await client.tearDown().catch(() => {});
  }
  await server?.stop().catch(() => {});
}

const attachedClients = new Set<{ tearDown(): Promise<void> }>();
let attachedSignalInstalled = false;

export function trackAttachedPocketIc(client: {
  tearDown(): Promise<void>;
}): void {
  attachedClients.add(client);
  if (attachedSignalInstalled) {
    return;
  }
  attachedSignalInstalled = true;
  // A SIGINT listener replaces Node's default exit; after DELETE we must exit ourselves.
  const onSignal = () => {
    void (async () => {
      const clients = [...attachedClients];
      attachedClients.clear();
      await Promise.all(clients.map((c) => c.tearDown().catch(() => {})));
      process.exit(0);
    })();
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
}
