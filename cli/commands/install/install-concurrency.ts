import process from "node:process";
import { AsyncLocalStorage } from "node:async_hooks";

// installMopsDep already downloads one package's files in parallel, so a pool
// of packages multiplies with it — the budget below is packages x file threads,
// not either on its own. GitHub Actions runners fail with "fetch failed" under
// high concurrency (installMopsDep caps its own file threads at 4 there for the
// same reason), so the whole budget halves in CI.
const MAX_PACKAGE_CONCURRENCY = process.env.GITHUB_ENV ? 2 : 4;
const REQUEST_BUDGET = process.env.GITHUB_ENV ? 8 : 16;

// installMopsDep's own default, which a single package still gets to use.
const MAX_FILE_THREADS = 12;

// How many packages may install at once. An explicit per-package thread count
// (`mops sources` passes 6) narrows the pool instead of multiplying with it.
export function packageConcurrency(depCount: number, threads?: number): number {
  let cap = threads
    ? Math.floor(REQUEST_BUDGET / threads)
    : MAX_PACKAGE_CONCURRENCY;
  return Math.max(1, Math.min(MAX_PACKAGE_CONCURRENCY, cap, depCount));
}

export function fileThreadsPerPackage(packages: number): number {
  return Math.max(
    1,
    Math.min(MAX_FILE_THREADS, Math.floor(REQUEST_BUDGET / packages)),
  );
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
// package. Failures are dropped from the map so a later request retries instead
// of inheriting a `false` from a transient error.
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
