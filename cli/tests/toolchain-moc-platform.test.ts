import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import nodePath from "node:path";

// `moc.ts` reaches the cache dir at module load, so it has to be redirected
// before the import below. `XDG_CACHE_HOME` is the real override rather than a
// mock, so this exercises the same wiring a user's machine has.
const cacheDir = mkdtempSync(nodePath.join(os.tmpdir(), "mops-moc-platform-"));
process.env.XDG_CACHE_HOME = cacheDir;

const { download } = await import("../commands/toolchain/moc.js");

// `mops.ts` nests this under a `mops` segment of its own.
const mocCacheDir = nodePath.join(cacheDir, "mops", "moc");

const MOCOK_VERSION = "1.15.1";

describe("moc.download on Intel Macs", () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(
    process,
    "platform",
  )!;
  const originalArch = Object.getOwnPropertyDescriptor(process, "arch")!;
  let originalFetch: typeof globalThis.fetch;
  let fetchMock: ReturnType<typeof jest.fn>;
  let log: ReturnType<typeof jest.spyOn>;

  const runningOn = (platform: string, arch: string) => {
    Object.defineProperty(process, "platform", { value: platform });
    Object.defineProperty(process, "arch", { value: arch });
  };

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = jest.fn(async () => {
      throw new Error("download must not reach the network");
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    log = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", originalPlatform);
    Object.defineProperty(process, "arch", originalArch);
    globalThis.fetch = originalFetch;
    log.mockRestore();
    rmSync(mocCacheDir, { recursive: true, force: true });
  });

  // The reason the fix is a 404 hint rather than a platform gate: several moc
  // versions still ship an Intel-Mac tarball, so an already-installed one must
  // keep working. A gate placed next to the win32 guard would break every
  // command on such a machine, offline, with no network involved.
  test("an already-installed moc is used without touching the network", async () => {
    let dir = nodePath.join(mocCacheDir, MOCOK_VERSION);
    mkdirSync(dir, { recursive: true });
    writeFileSync(nodePath.join(dir, "moc"), "binary");
    writeFileSync(nodePath.join(dir, "moc.js"), "js");

    runningOn("darwin", "x64");
    await expect(download(MOCOK_VERSION)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
