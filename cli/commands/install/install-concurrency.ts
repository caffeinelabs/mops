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
// An in-flight request holds a socket, and the install holds more fds around
// it (staged writes, cache copies, node's own baseline), so a request may
// claim at most this fraction of the fd soft limit. The usual limits pass
// untouched: macOS's default 256 still allows the full budget of 16.
const FDS_PER_REQUEST = 16;

// EMFILE is enforced against the soft limit, which node only exposes through
// the diagnostic report (~15 ms). Read it once, and only on the install path.
let cachedFdSoftLimit: number | undefined;

export function fdSoftLimit(): number {
  if (cachedFdSoftLimit === undefined) {
    try {
      let report = process.report?.getReport() as unknown as
        | { userLimits?: { open_files?: { soft?: unknown } } }
        | undefined;
      let soft = report?.userLimits?.open_files?.soft;
      // "unlimited" comes through as a string; absent on Windows.
      cachedFdSoftLimit =
        typeof soft === "number" && soft > 0 ? soft : Infinity;
    } catch {
      cachedFdSoftLimit = Infinity;
    }
  }
  return cachedFdSoftLimit;
}

// pnpm derives its download concurrency from the CPU count and clamps it;
// same mechanism here, with smaller numbers because registry requests are
// heavier than tarball fetches. A 1-CPU container lands on the floor, which
// replaces the old `GITHUB_ENV` brand check with an actual constraint.
// The fd soft limit caps the result separately: CPUs say nothing about
// EMFILE, and a many-core box with a low `ulimit -n` must not get the full
// budget.
export function deriveRequestBudget(cpus: number, fdLimit = Infinity): number {
  let cpuBudget = Math.min(
    MAX_REQUEST_BUDGET,
    Math.max(MIN_REQUEST_BUDGET, cpus * 2),
  );
  let fdBudget = Math.max(1, Math.floor(fdLimit / FDS_PER_REQUEST));
  return Math.min(cpuBudget, fdBudget);
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
  return deriveRequestBudget(os.availableParallelism(), fdSoftLimit());
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

// Each cache-copy task is a recursive directory copy, and on the repair path
// also a download. Half the budget bounds the pool, so every repair keeps at
// least two requests to itself and a halved retry budget shrinks the number
// of concurrent copies with it.
const MAX_COPY_CONCURRENCY = 8;

export function copyConcurrency(budget: number): number {
  return Math.max(1, Math.min(MAX_COPY_CONCURRENCY, Math.floor(budget / 2)));
}

// The failures worth a retry: connection-level fetch errors and fd
// exhaustion, where the cause is usually the aggregate concurrency rather
// than the one request that lost. A registry answer ("Package not found") is
// never transient. Checked against the whole cause chain, because undici
// reports every network failure as a bare "fetch failed" TypeError with the
// syscall error nested under `cause`.
const TRANSIENT_ERROR_PATTERN =
  /fetch failed|failed to fetch|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EMFILE|ENFILE|EAI_AGAIN|UND_ERR_|socket hang up|other side closed|network socket disconnected/i;

export function isTransientNetworkError(err: unknown, depth = 0): boolean {
  if (err == null || depth > 5) {
    return false;
  }
  if (typeof err === "string") {
    return TRANSIENT_ERROR_PATTERN.test(err);
  }
  if (typeof err !== "object") {
    return false;
  }
  let e = err as {
    message?: unknown;
    code?: unknown;
    cause?: unknown;
    errors?: unknown;
  };
  // Strings only: the agent's AgentError carries an ErrorCode *object* in
  // `code` whose toString() can itself throw, so nothing here may stringify
  // a non-string property.
  try {
    let text =
      (typeof e.message === "string" ? e.message : "") +
      " " +
      (typeof e.code === "string" ? e.code : "");
    if (TRANSIENT_ERROR_PATTERN.test(text)) {
      return true;
    }
    // AggregateError, and ncp's array-of-errors rejections
    if (
      Array.isArray(e.errors) &&
      e.errors.some((inner) => isTransientNetworkError(inner, depth + 1))
    ) {
      return true;
    }
    return isTransientNetworkError(e.cause, depth + 1);
  } catch {
    // a throwing getter is not a network error
    return false;
  }
}

function errorText(err: unknown): string {
  try {
    let text = err instanceof Error ? err.message : String(err);
    return text.split("\n")[0] ?? text;
  } catch {
    // a throwing toString or message getter must not break the caller's
    // staging cleanup
    return "unprintable error";
  }
}

// One install run. The top-level call decides `threads`; transitive levels
// inherit it because they cannot see how wide the pool above them is.
// `transientErrors` collects what individual package installs swallowed —
// they report failure as `false`, so this is the only way the run can tell
// a dead network from a package that does not exist.
export type InstallScope = {
  threads: number;
  inFlight: Map<string, Promise<boolean>>;
  transientErrors: string[];
};

const scopeStorage = new AsyncLocalStorage<InstallScope>();

export function getInstallScope(): InstallScope | undefined {
  return scopeStorage.getStore();
}

export function createInstallScope(threads: number): InstallScope {
  return { threads, inFlight: new Map(), transientErrors: [] };
}

export function noteTransientNetworkError(err: unknown): void {
  let scope = getInstallScope();
  if (scope && isTransientNetworkError(err)) {
    scope.transientErrors.push(errorText(err));
  }
}

// Attempts an install run may make before giving up: the initial one and the
// retries after it.
export const MAX_INSTALL_ATTEMPTS = 3;

// Whether a failed attempt earned a retry, and the budget to retry with.
// Only transient failures qualify — noted by a package install or thrown
// through the pool. The budget halves so an environment that cannot sustain
// the concurrency degrades to a slower install instead of a broken one;
// per-request retries cannot do that, because the other requests are still
// holding the same ceiling. Returns undefined when the run should fail.
export function nextRetryBudget(
  scope: InstallScope,
  thrown: unknown,
  attempt: number,
  budget: number,
): number | undefined {
  // A deterministic thrown error fails the run outright, even when a
  // sibling noted a transient one — no retry can fix a parse error.
  if (thrown !== undefined && !isTransientNetworkError(thrown)) {
    return undefined;
  }
  let transient =
    thrown !== undefined ? errorText(thrown) : scope.transientErrors[0];
  if (transient === undefined || attempt >= MAX_INSTALL_ATTEMPTS) {
    return undefined;
  }
  let next = Math.max(1, Math.floor(budget / 2));
  console.warn(
    chalk.yellow("Warning: ") +
      `network error (${transient}); retrying with concurrency ${next} (attempt ${attempt + 1}/${MAX_INSTALL_ATTEMPTS})`,
  );
  return next;
}

export function runInInstallScope<T>(
  scope: InstallScope,
  fn: () => Promise<T>,
): Promise<T> {
  return scopeStorage.run(scope, fn);
}

// The self-healing retry for a single-package install that runs outside an
// install run (`mops add`, the fetch-on-miss repair in resolvePackages).
// Inside an existing scope the surrounding run owns the retry, so the
// install runs once with the scope's thread share.
export async function installWithRetry(
  install: (threads: number) => Promise<boolean>,
): Promise<boolean> {
  let existing = getInstallScope();
  if (existing) {
    return install(existing.threads);
  }
  let budget = requestBudget();
  for (let attempt = 1; ; attempt++) {
    let threads = fileThreadsPerPackage(1, budget);
    let scope = createInstallScope(threads);
    let ok = false;
    let thrown: unknown = undefined;
    try {
      ok = await runInInstallScope(scope, () => install(threads));
    } catch (err) {
      thrown = err;
    }
    if (ok) {
      return true;
    }
    let retryBudget = nextRetryBudget(scope, thrown, attempt, budget);
    if (retryBudget === undefined) {
      if (thrown !== undefined) {
        throw thrown;
      }
      return false;
    }
    budget = retryBudget;
  }
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
