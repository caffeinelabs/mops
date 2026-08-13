import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import os from "node:os";
import process from "node:process";
import {
  copyConcurrency,
  createInstallScope,
  deriveRequestBudget,
  fdSoftLimit,
  fileThreadsPerPackage,
  installWithRetry,
  isTransientNetworkError,
  MAX_INSTALL_ATTEMPTS,
  nextRetryBudget,
  noteTransientNetworkError,
  packageConcurrency,
  requestBudget,
  runInInstallScope,
} from "../commands/install/install-concurrency";

describe("deriveRequestBudget", () => {
  test("scales with the CPU count and clamps to 4-16", () => {
    expect(deriveRequestBudget(1)).toBe(4);
    expect(deriveRequestBudget(2)).toBe(4);
    expect(deriveRequestBudget(3)).toBe(6);
    expect(deriveRequestBudget(4)).toBe(8);
    expect(deriveRequestBudget(8)).toBe(16);
    expect(deriveRequestBudget(64)).toBe(16);
  });

  test("a low fd soft limit caps the budget below the CPU-derived floor", () => {
    // macOS's default 256 and anything above it change nothing
    expect(deriveRequestBudget(8, 256)).toBe(16);
    expect(deriveRequestBudget(8, 1048576)).toBe(16);
    // a constrained ulimit -n bites regardless of core count
    expect(deriveRequestBudget(64, 128)).toBe(8);
    expect(deriveRequestBudget(64, 64)).toBe(4);
    expect(deriveRequestBudget(64, 32)).toBe(2);
    expect(deriveRequestBudget(64, 20)).toBe(1);
    // the CPU clamp still applies when fds are plentiful
    expect(deriveRequestBudget(1, 1048576)).toBe(4);
  });

  test("fdSoftLimit reports a positive number or Infinity", () => {
    let limit = fdSoftLimit();
    expect(limit).toBeGreaterThan(0);
    expect(fdSoftLimit()).toBe(limit);
  });
});

describe("isTransientNetworkError", () => {
  test("matches the connection-level failure modes", () => {
    expect(isTransientNetworkError(new TypeError("fetch failed"))).toBe(true);
    expect(
      isTransientNetworkError(
        Object.assign(new Error("connect ECONNRESET 1.2.3.4:443"), {
          code: "ECONNRESET",
        }),
      ),
    ).toBe(true);
    expect(
      isTransientNetworkError(
        new Error("EMFILE: too many open files, open 'lib.mo'"),
      ),
    ).toBe(true);
    expect(isTransientNetworkError("socket hang up")).toBe(true);
  });

  test("walks the cause chain undici buries syscall errors in", () => {
    let syscall = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    expect(
      isTransientNetworkError(
        new TypeError("request failed", { cause: syscall }),
      ),
    ).toBe(true);
    expect(
      isTransientNetworkError(new AggregateError([syscall], "all failed")),
    ).toBe(true);
  });

  test("rejects registry answers and unrelated errors", () => {
    expect(isTransientNetworkError("Package not found")).toBe(false);
    expect(isTransientNetworkError(new Error("integrity check failed"))).toBe(
      false,
    );
    expect(isTransientNetworkError(undefined)).toBe(false);
    expect(isTransientNetworkError(null)).toBe(false);
    expect(isTransientNetworkError(42)).toBe(false);
  });

  test("an agent error with an object code whose toString throws is classified by message", () => {
    // @icp-sdk/core's AgentError: message carries the text, `code` is an
    // ErrorCode object whose toString() can throw (seen live against a dead
    // registry endpoint)
    let code = {
      toString() {
        throw new Error("Uint8Array expected");
      },
    };
    let agentError = Object.assign(
      new Error("Failed to fetch HTTP request: TypeError: fetch failed"),
      { code },
    );
    expect(isTransientNetworkError(agentError)).toBe(true);
    expect(
      isTransientNetworkError(
        Object.assign(new Error("reject code 4"), { code }),
      ),
    ).toBe(false);
  });

  test("a self-referential cause chain terminates", () => {
    let err: any = new Error("boring");
    err.cause = err;
    expect(isTransientNetworkError(err)).toBe(false);
  });
});

describe("nextRetryBudget", () => {
  let warn: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  test("halves the budget when the scope noted a transient error", () => {
    let scope = createInstallScope(8);
    scope.transientErrors.push("fetch failed");
    expect(nextRetryBudget(scope, undefined, 1, 16)).toBe(8);
    expect(nextRetryBudget(scope, undefined, 2, 8)).toBe(4);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/fetch failed/);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/concurrency 8/);
  });

  test("a transient thrown error qualifies without a scope note", () => {
    expect(
      nextRetryBudget(
        createInstallScope(8),
        new TypeError("fetch failed"),
        1,
        4,
      ),
    ).toBe(2);
  });

  test("permanent failures and exhausted attempts do not retry", () => {
    let noted = createInstallScope(8);
    noted.transientErrors.push("ECONNRESET");
    expect(nextRetryBudget(createInstallScope(8), undefined, 1, 16)).toBe(
      undefined,
    );
    expect(
      nextRetryBudget(createInstallScope(8), new Error("boom"), 1, 16),
    ).toBe(undefined);
    expect(nextRetryBudget(noted, undefined, MAX_INSTALL_ATTEMPTS, 16)).toBe(
      undefined,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  test("a deterministic thrown error is not retried even when a sibling noted a transient one", () => {
    let scope = createInstallScope(8);
    scope.transientErrors.push("fetch failed");
    expect(
      nextRetryBudget(scope, new Error("Invalid config file"), 1, 16),
    ).toBe(undefined);
    expect(warn).not.toHaveBeenCalled();
  });

  test("the budget floors at 1", () => {
    let scope = createInstallScope(1);
    scope.transientErrors.push("EMFILE");
    expect(nextRetryBudget(scope, undefined, 1, 1)).toBe(1);
  });
});

describe("requestBudget", () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env.MOPS_CONCURRENCY;
    delete process.env.MOPS_CONCURRENCY;
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.MOPS_CONCURRENCY;
    } else {
      process.env.MOPS_CONCURRENCY = savedEnv;
    }
  });

  test("defaults derive from available parallelism and the fd limit", () => {
    expect(requestBudget()).toBe(
      deriveRequestBudget(os.availableParallelism(), fdSoftLimit()),
    );
  });

  test("MOPS_CONCURRENCY overrides the derived default", () => {
    process.env.MOPS_CONCURRENCY = "8";
    expect(requestBudget()).toBe(8);
    process.env.MOPS_CONCURRENCY = "1";
    expect(requestBudget()).toBe(1);
    // no clamp on explicit values: the user knows their environment
    process.env.MOPS_CONCURRENCY = "100";
    expect(requestBudget()).toBe(100);
  });

  test("invalid MOPS_CONCURRENCY falls back to the derived default", () => {
    let derived = deriveRequestBudget(os.availableParallelism());
    for (let bad of ["abc", "0", "-2", "2.5", ""]) {
      process.env.MOPS_CONCURRENCY = bad;
      expect(requestBudget()).toBe(derived);
    }
  });

  test("an explicit value (the --concurrency flag) wins over the env var", () => {
    process.env.MOPS_CONCURRENCY = "9";
    expect(requestBudget(3)).toBe(3);
  });

  test("explicit values are floored at 1", () => {
    expect(requestBudget(0)).toBe(1);
  });
});

describe("budget split", () => {
  test("packageConcurrency caps at 4, the dep count and the budget", () => {
    expect(packageConcurrency(8, 16)).toBe(4);
    expect(packageConcurrency(2, 16)).toBe(2);
    expect(packageConcurrency(8, 1)).toBe(1);
    expect(packageConcurrency(8, 2)).toBe(2);
    expect(packageConcurrency(0, 16)).toBe(1);
  });

  test("an explicit per-package thread count narrows the pool", () => {
    // `mops sources` passes 6 file threads: 2 packages x 6 = 12 <= 16
    expect(packageConcurrency(8, 16, 6)).toBe(2);
    expect(packageConcurrency(8, 16, 12)).toBe(1);
  });

  test("fileThreadsPerPackage divides the budget and stays within 1-12", () => {
    expect(fileThreadsPerPackage(1, 16)).toBe(12);
    expect(fileThreadsPerPackage(4, 16)).toBe(4);
    expect(fileThreadsPerPackage(8, 16)).toBe(2);
    expect(fileThreadsPerPackage(8, 4)).toBe(1);
  });

  test("pool x threads never exceeds the budget", () => {
    for (let budget = 1; budget <= 20; budget++) {
      for (let deps = 1; deps <= 10; deps++) {
        let pool = packageConcurrency(deps, budget);
        let threads = fileThreadsPerPackage(pool, budget);
        expect(pool * threads).toBeLessThanOrEqual(budget);
      }
    }
  });

  test("copyConcurrency follows the budget down and stays within 1-8", () => {
    expect(copyConcurrency(100)).toBe(8);
    expect(copyConcurrency(16)).toBe(8);
    expect(copyConcurrency(8)).toBe(4);
    expect(copyConcurrency(4)).toBe(2);
    expect(copyConcurrency(2)).toBe(1);
    expect(copyConcurrency(1)).toBe(1);
  });
});

describe("noteTransientNetworkError", () => {
  test("a transient error whose toString throws is still noted", async () => {
    let scope = createInstallScope(4);
    await runInInstallScope(scope, async () => {
      noteTransientNetworkError({
        message: "fetch failed",
        toString() {
          throw new Error("Uint8Array expected");
        },
      });
    });
    expect(scope.transientErrors).toEqual(["unprintable error"]);
  });
});

describe("installWithRetry", () => {
  let savedEnv: string | undefined;
  let warn: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    savedEnv = process.env.MOPS_CONCURRENCY;
    process.env.MOPS_CONCURRENCY = "16";
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

  test("retries a noted transient failure with fewer threads", async () => {
    let calls: number[] = [];
    let ok = await installWithRetry(async (threads) => {
      calls.push(threads);
      if (calls.length === 1) {
        noteTransientNetworkError(new TypeError("fetch failed"));
        return false;
      }
      return true;
    });
    expect(ok).toBe(true);
    expect(calls).toEqual([12, 8]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("a permanent failure is not retried", async () => {
    let calls = 0;
    let ok = await installWithRetry(async () => {
      calls++;
      return false;
    });
    expect(ok).toBe(false);
    expect(calls).toBe(1);
  });

  test("a thrown permanent error propagates unretried", async () => {
    let calls = 0;
    await expect(
      installWithRetry(async () => {
        calls++;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(calls).toBe(1);
  });

  test("inside an existing scope the surrounding run owns the retry", async () => {
    let scope = createInstallScope(5);
    let calls: number[] = [];
    let ok = await runInInstallScope(scope, () =>
      installWithRetry(async (threads) => {
        calls.push(threads);
        noteTransientNetworkError(new TypeError("fetch failed"));
        return false;
      }),
    );
    expect(ok).toBe(false);
    expect(calls).toEqual([5]);
    expect(scope.transientErrors).toEqual(["fetch failed"]);
  });
});
