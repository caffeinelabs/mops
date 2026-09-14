import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { installVersion } from "../commands/toolchain/toolchain-utils";

// Regression for caffeinelabs/mops#818: concurrent `mops` processes on a
// cold cache used to download and extract the same tool version into the
// same directory at once. proper-lockfile locks through the filesystem, so
// concurrent calls in one process exercise the same path as two processes.
describe("installVersion", () => {
  let cacheDir: string;
  let destDir: string;
  let error: ReturnType<typeof jest.spyOn>;
  let log: ReturnType<typeof jest.spyOn>;

  const isComplete = () => existsSync(path.join(destDir, "bin"));

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(os.tmpdir(), "mops-toolchain-"));
    destDir = path.join(cacheDir, "moc", "1.0.0");
    error = jest.spyOn(console, "error").mockImplementation(() => {});
    log = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    error.mockRestore();
    log.mockRestore();
    rmSync(cacheDir, { recursive: true, force: true });
  });

  test("concurrent installs of one version populate it exactly once", async () => {
    let populated = 0;
    const install = () =>
      installVersion(destDir, {
        label: "moc 1.0.0",
        isComplete,
        populate: async (stagingDir) => {
          populated++;
          // long enough for every peer to hit the lock
          await sleep(300);
          writeFileSync(path.join(stagingDir, "bin"), "moc");
        },
      });

    await Promise.all([install(), install(), install()]);

    expect(populated).toBe(1);
    expect(isComplete()).toBe(true);
    // no staging dirs or lock dirs left behind
    expect(readdirSync(path.dirname(destDir))).toEqual(["1.0.0"]);
    // the wait is announced on stderr: stdout may be a command-substituted
    // binary path
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining(
        "Waiting for another mops process to install moc 1.0.0",
      ),
    );
    expect(log).not.toHaveBeenCalled();
  });

  test("a complete install skips populate without taking the lock", async () => {
    mkdirSync(destDir, { recursive: true });
    writeFileSync(path.join(destDir, "bin"), "moc");
    let populated = 0;

    await installVersion(destDir, {
      label: "moc 1.0.0",
      isComplete,
      populate: async () => {
        populated++;
      },
    });

    expect(populated).toBe(0);
    expect(readdirSync(path.dirname(destDir))).toEqual(["1.0.0"]);
  });

  test("an incomplete leftover dir is replaced, not extracted into", async () => {
    mkdirSync(destDir, { recursive: true });
    writeFileSync(path.join(destDir, "moc.js"), "partial");

    await installVersion(destDir, {
      label: "moc 1.0.0",
      isComplete,
      populate: async (stagingDir) => {
        writeFileSync(path.join(stagingDir, "bin"), "moc");
      },
    });

    expect(readdirSync(destDir)).toEqual(["bin"]);
  });

  test("a failed populate leaves nothing behind and releases the lock", async () => {
    await expect(
      installVersion(destDir, {
        label: "moc 1.0.0",
        isComplete,
        populate: async (stagingDir) => {
          writeFileSync(path.join(stagingDir, "bin"), "half");
          throw new Error("unexpected end of file");
        },
      }),
    ).rejects.toThrow("unexpected end of file");

    expect(existsSync(destDir)).toBe(false);
    expect(readdirSync(path.dirname(destDir))).toEqual([]);

    // the next attempt is not blocked by the failed one
    await installVersion(destDir, {
      label: "moc 1.0.0",
      isComplete,
      populate: async (stagingDir) => {
        writeFileSync(path.join(stagingDir, "bin"), "moc");
      },
    });
    expect(isComplete()).toBe(true);
    expect(error).not.toHaveBeenCalled();
  });
});
