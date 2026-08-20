import chalk from "chalk";
import semver from "semver";
import { FILE_PATH_REGEX } from "../constants.js";
import { RECOMMENDED_POCKET_IC_VERSION } from "../commands/toolchain/pocket-ic-versions.js";

export const MIN_DFINITY_CLIENT_POCKET_IC_VERSION = "9.0.0";

let ignoredPinWarned = false;
let attachedLogsWarned = false;
// Keyed on the raw env value so tests (and nothing else — the variable cannot
// change mid-run) can vary it, while production parses it once.
let cachedRaw: string | undefined;
let cachedUrl: string | undefined;

// Throws on a malformed value. The CLI validates once per invocation (the
// preAction hook in cli.ts turns the throw into a clean error before any
// command runs), so downstream callers can treat this as non-throwing.
export function getPocketIcUrl(): string | undefined {
  const raw = process.env.MOPS_POCKET_IC_URL?.trim() || undefined;
  if (raw === cachedRaw) {
    return cachedUrl;
  }
  if (!raw) {
    cachedRaw = undefined;
    cachedUrl = undefined;
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
  cachedRaw = raw;
  cachedUrl = raw.replace(/\/+$/, "");
  return cachedUrl;
}

export function hasPocketIcSource(pin: string | undefined): boolean {
  return Boolean(getPocketIcUrl() || pin);
}

// Takes a thunk so the `readConfig()` behind the pin lookup is only paid until
// the warning has fired once (`mops watch` restarts the replica repeatedly).
export function warnIgnoredPocketIcPin(
  getVersion: () => string | undefined,
): void {
  if (ignoredPinWarned) {
    return;
  }
  const version = getVersion();
  if (!version) {
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

// An attached server's stderr is not reachable, and that stream is the only
// source of `[Canister <id>] ...` lines — per-test names and `Debug.print`
// output. Said once per run so a silent degradation doesn't read as "my
// prints don't execute".
export function warnAttachedCanisterLogsUnavailable(): void {
  if (attachedLogsWarned) {
    return;
  }
  attachedLogsWarned = true;
  console.log(
    chalk.yellow(
      "Attached PocketIC (`MOPS_POCKET_IC_URL`): canister log output is not streamed — " +
        "test names and `Debug.print` output will not appear.",
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
        `Use an exact semantic version. Run \`mops toolchain use pocket-ic ${RECOMMENDED_POCKET_IC_VERSION}\` to pin a supported version.`,
    );
  }
  if (semver.lt(version, MIN_DFINITY_CLIENT_POCKET_IC_VERSION)) {
    throw new Error(
      `PocketIC ${version} is incompatible with deployment checks. ` +
        `\`mops build --check-deploy\` requires pocket-ic ${MIN_DFINITY_CLIENT_POCKET_IC_VERSION} or newer. ` +
        `Run \`mops toolchain use pocket-ic ${RECOMMENDED_POCKET_IC_VERSION}\` to pin a supported version.`,
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
  if (client) {
    if (!sigint || !server) {
      await client.tearDown().catch(() => {});
    }
    untrackAttachedPocketIc(client);
  }
  await server?.stop().catch(() => {});
}

const attachedClients = new Set<{ tearDown(): Promise<void> }>();
let attachedShuttingDown = false;

// A wedged server must not make Ctrl+C hang: the instance DELETE gets this
// long, then the process exits anyway (a leaked instance on an unreachable
// server is unavoidable).
const SIGNAL_TEARDOWN_TIMEOUT_MS = 5000;

// A SIGINT listener replaces Node's default exit; after DELETE we must exit
// ourselves — unless another listener (e.g. watch mode's) owns the exit path,
// in which case deleting the instances is this handler's only job.
function onAttachedSignal(signal: NodeJS.Signals): void {
  const exitCode = signal === "SIGINT" ? 130 : 143;
  if (attachedShuttingDown) {
    // A second signal means "stop waiting" — exit immediately.
    // eslint-disable-next-line no-restricted-properties
    process.exit(exitCode);
  }
  attachedShuttingDown = true;
  const clients = [...attachedClients];
  attachedClients.clear();
  const teardown = Promise.all(
    clients.map((c) => c.tearDown().catch(() => {})),
  );
  const timeout = new Promise<void>((resolve) => {
    setTimeout(resolve, SIGNAL_TEARDOWN_TIMEOUT_MS).unref();
  });
  void Promise.race([teardown, timeout]).then(() => {
    if (process.listenerCount(signal) <= 1) {
      // eslint-disable-next-line no-restricted-properties
      process.exit(exitCode);
    }
  });
}

export function trackAttachedPocketIc(client: {
  tearDown(): Promise<void>;
}): void {
  if (attachedClients.has(client)) {
    return;
  }
  attachedClients.add(client);
  if (attachedClients.size === 1) {
    process.on("SIGINT", onAttachedSignal);
    process.on("SIGTERM", onAttachedSignal);
  }
}

// Uninstalls the signal listeners with the last client, so an interrupt in a
// later phase of the run (saving results, watch idling) keeps the command's
// own exit path instead of this handler's.
function untrackAttachedPocketIc(client: { tearDown(): Promise<void> }): void {
  if (attachedClients.delete(client) && attachedClients.size === 0) {
    process.off("SIGINT", onAttachedSignal);
    process.off("SIGTERM", onAttachedSignal);
  }
}
