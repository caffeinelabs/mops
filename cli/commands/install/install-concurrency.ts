import process from "node:process";
import os from "node:os";
import { AsyncLocalStorage } from "node:async_hooks";
import chalk from "chalk";

// installMopsDep downloads one package's files in parallel, so a pool of
// packages would multiply with it. Everything below divides one request
// budget — pnpm's `network-concurrency` model — instead of stacking pools.
const MIN_REQUEST_BUDGET = 4;
const MAX_REQUEST_BUDGET = 16;
const MAX_PACKAGE_CONCURRENCY = 4;
// installMopsDep's historical thread count, which a single package still gets.
const MAX_FILE_THREADS = 12;

// pnpm derives its download concurrency from the CPU count and clamps it;
// same mechanism here, with smaller numbers because registry requests are
// heavier than tarball fetches. A 1-CPU container lands on the floor, which
// replaces the old `GITHUB_ENV` brand check with an actual constraint.
export function deriveRequestBudget(cpus: number): number {
  return Math.min(MAX_REQUEST_BUDGET, Math.max(MIN_REQUEST_BUDGET, cpus * 2));
}

let warnedInvalidEnv = false;

// Total simultaneous registry requests one install may keep in flight.
// `--concurrency` wins over `MOPS_CONCURRENCY`; the env var exists for
// environments where the command line cannot be edited (Docker builds,
// prebuilt CI images).
export function requestBudget(explicit?: number): number {
  if (explicit !== undefined) {
    return Math.max(1, Math.floor(explicit));
  }
  let env = process.env.MOPS_CONCURRENCY;
  if (env) {
    let value = Number(env);
    if (Number.isInteger(value) && value >= 1) {
      return value;
    }
    if (!warnedInvalidEnv) {
      warnedInvalidEnv = true;
      console.warn(
        chalk.yellow("Warning: ") +
          `ignoring MOPS_CONCURRENCY="${env}" (expected an integer >= 1)`,
      );
    }
  }
  return deriveRequestBudget(os.availableParallelism());
}

// How many packages may install at once. An explicit per-package thread count
// (`mops sources` passes 6) narrows the pool instead of multiplying with it.
export function packageConcurrency(
  depCount: number,
  budget: number,
  threads?: number,
): number {
  let cap = threads ? Math.floor(budget / threads) : MAX_PACKAGE_CONCURRENCY;
  return Math.max(1, Math.min(MAX_PACKAGE_CONCURRENCY, cap, depCount, budget));
}

export function fileThreadsPerPackage(
  packages: number,
  budget: number = requestBudget(),
): number {
  return Math.max(1, Math.min(MAX_FILE_THREADS, Math.floor(budget / packages)));
}

// One install run. The top-level call decides `threads`; transitive levels
// inherit it because they cannot see how wide the pool above them is.
export type InstallScope = {
  threads: number;
  inFlight: Map<string, Promise<boolean>>;
};

const scopeStorage = new AsyncLocalStorage<InstallScope>();

export function getInstallScope(): InstallScope | undefined {
  return scopeStorage.getStore();
}

export function createInstallScope(threads: number): InstallScope {
  return { threads, inFlight: new Map() };
}

export function runInInstallScope<T>(
  scope: InstallScope,
  fn: () => Promise<T>,
): Promise<T> {
  return scopeStorage.run(scope, fn);
}

// Share one install between branches of the graph that request the same
// package. Failures are dropped from the map so a later request retries
// instead of inheriting a `false` from a transient error.
export function dedupeInstall(
  key: string,
  fn: () => Promise<boolean>,
): Promise<boolean> {
  let scope = getInstallScope();
  if (!scope) {
    return fn();
  }
  let existing = scope.inFlight.get(key);
  if (existing) {
    return existing;
  }
  let promise = fn().then(
    (ok) => {
      ok || scope.inFlight.delete(key);
      return ok;
    },
    (err) => {
      scope.inFlight.delete(key);
      throw err;
    },
  );
  scope.inFlight.set(key, promise);
  return promise;
}
