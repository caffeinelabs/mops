import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

// syncLocalCache's repair path reports a transient download failure as a
// thrown "could not be downloaded" — the retry must see through that via the
// scope note, not the thrown message.
jest.unstable_mockModule("../resolve-packages", () => ({
  resolvePackages: jest.fn(async () => ({ core: "1.0.0" })),
}));
jest.unstable_mockModule("../mops", () => ({
  getDependencyType: () => "mops",
  getRootDir: () => rootDir,
}));
jest.unstable_mockModule("../cache", () => ({
  getDepCacheName: (name: string, version: string) => `${name}@${version}`,
  isDepCached: () => false,
  sweepStaleStagingDirs: () => {},
  copyCache: jest.fn(async () => {}),
}));
jest.unstable_mockModule("../commands/install/install-mops-dep", () => ({
  installMopsDep: jest.fn(),
}));
jest.unstable_mockModule("../commands/install/install-from-github", () => ({
  installFromGithub: jest.fn(),
}));

const { installMopsDep } = await import("../commands/install/install-mops-dep");
const { copyCache } = await import("../cache");
const { syncLocalCache } = await import("../commands/install/sync-local-cache");
const { noteTransientNetworkError } =
  await import("../commands/install/install-concurrency");

const installMopsDepMock = installMopsDep as jest.Mock<typeof installMopsDep>;

let rootDir: string;

describe("syncLocalCache transient-failure retry", () => {
  let warn: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    rootDir = mkdtempSync(path.join(os.tmpdir(), "mops-sync-retry-"));
    process.env.MOPS_CONCURRENCY = "16";
    installMopsDepMock.mockReset();
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.MOPS_CONCURRENCY;
    rmSync(rootDir, { recursive: true, force: true });
    warn.mockRestore();
  });

  test("a transient repair failure retries and then succeeds", async () => {
    installMopsDepMock
      .mockImplementationOnce(async () => {
        noteTransientNetworkError(new TypeError("fetch failed"));
        return false;
      })
      .mockResolvedValueOnce(true);

    await expect(syncLocalCache()).resolves.toEqual({ core: "1.0.0" });
    expect(installMopsDepMock).toHaveBeenCalledTimes(2);
    expect(copyCache).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/retrying/);
  });

  test("a permanent repair failure throws without a retry", async () => {
    installMopsDepMock.mockResolvedValue(false);

    await expect(syncLocalCache()).rejects.toThrow(/could not be downloaded/);
    expect(installMopsDepMock).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });
});
