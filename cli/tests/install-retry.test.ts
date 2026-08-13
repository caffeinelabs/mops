import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import process from "node:process";
import { Dependency } from "../types";

// The retry loop must be observed through the real installDeps, so only the
// per-package leaf is mocked. `threads` handed to it is the visible trace of
// the budget: with one dep and a budget of 16 the attempts should descend
// 12 -> 8 -> 4.
jest.unstable_mockModule("../commands/install/install-dep", () => ({
  installDep: jest.fn(),
}));

const { installDep } = await import("../commands/install/install-dep");
const { installDeps } = await import("../commands/install/install-deps");
const { noteTransientNetworkError } =
  await import("../commands/install/install-concurrency");

const installDepMock = installDep as jest.Mock<typeof installDep>;

const dep: Dependency = { name: "core", version: "1.0.0" };

const threadsPassed = () =>
  installDepMock.mock.calls.map((call) => (call[1] as any)?.threads);

describe("installDeps transient-failure retry", () => {
  let savedEnv: string | undefined;
  let warn: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    savedEnv = process.env.MOPS_CONCURRENCY;
    // pin the budget so the expected thread counts do not depend on the host
    process.env.MOPS_CONCURRENCY = "16";
    installDepMock.mockReset();
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.MOPS_CONCURRENCY;
    } else {
      process.env.MOPS_CONCURRENCY = savedEnv;
    }
    warn.mockRestore();
  });

  test("a noted transient failure retries with the budget halved, then succeeds", async () => {
    let failures = 2;
    installDepMock.mockImplementation(async () => {
      if (failures-- > 0) {
        noteTransientNetworkError(new TypeError("fetch failed"));
        return false;
      }
      return true;
    });

    await expect(installDeps([dep], { silent: true })).resolves.toBe(true);
    expect(threadsPassed()).toEqual([12, 8, 4]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/fetch failed/);
  });

  test("a permanent failure is not retried", async () => {
    installDepMock.mockImplementation(async () => false);

    await expect(installDeps([dep], { silent: true })).resolves.toBe(false);
    expect(installDepMock).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  test("attempts are exhausted after two retries", async () => {
    installDepMock.mockImplementation(async () => {
      noteTransientNetworkError(
        Object.assign(new Error("connect ECONNRESET"), { code: "ECONNRESET" }),
      );
      return false;
    });

    await expect(installDeps([dep], { silent: true })).resolves.toBe(false);
    expect(installDepMock).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  test("a thrown transient error is retried too", async () => {
    installDepMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(true);

    await expect(installDeps([dep], { silent: true })).resolves.toBe(true);
    expect(installDepMock).toHaveBeenCalledTimes(2);
  });

  test("a thrown permanent error propagates unretried", async () => {
    installDepMock.mockRejectedValue(new Error("boom"));

    await expect(installDeps([dep], { silent: true })).rejects.toThrow("boom");
    expect(installDepMock).toHaveBeenCalledTimes(1);
  });
});
