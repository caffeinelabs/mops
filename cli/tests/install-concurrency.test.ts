import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import os from "node:os";
import process from "node:process";
import {
  deriveRequestBudget,
  fileThreadsPerPackage,
  packageConcurrency,
  requestBudget,
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

  test("defaults derive from available parallelism", () => {
    expect(requestBudget()).toBe(
      deriveRequestBudget(os.availableParallelism()),
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
});
