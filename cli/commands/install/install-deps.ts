import { Dependency } from "../../types.js";
import { parallel } from "../../parallel.js";
import { getDepName } from "../../helpers/get-dep-name.js";
import { installDep } from "./install-dep.js";
import {
  createInstallScope,
  dedupeInstall,
  fileThreadsPerPackage,
  getInstallScope,
  nextRetryBudget,
  packageConcurrency,
  requestBudget,
  runInInstallScope,
} from "./install-concurrency.js";

type InstallDepsOptions = {
  verbose?: boolean;
  silent?: boolean;
  threads?: number;
  concurrency?: number;
  ignoreTransitive?: boolean;
};

// Identifies the work, not the declaration: an alias and its base package at
// the same version are one cache entry, so they are one install.
function depKey(dep: Dependency, ignoreTransitive?: boolean): string {
  let source = dep.repo || `${getDepName(dep.name)}@${dep.version}`;
  return `${source}|${ignoreTransitive ? 1 : 0}`;
}

// install all dependencies
// returns actual installed dependencies
// returns false if failed
export async function installDeps(
  deps: Dependency[],
  {
    verbose,
    silent,
    threads,
    concurrency,
    ignoreTransitive,
  }: InstallDepsOptions = {},
  parentPkgPath?: string,
  // Local `path` deps already walked in this run, by resolved directory. A
  // default here means every top-level caller starts a fresh run, and only the
  // recursion below carries one along.
  visitedLocalDeps: Set<string> = new Set(),
): Promise<boolean> {
  let installLevel = async (
    poolSize: number,
    depThreads: number,
    visited: Set<string>,
  ): Promise<boolean> => {
    let ok = true;

    // A failed dependency does not abort the rest, same as the sequential loop
    // this replaced — every package gets its own error message.
    let install = async (dep: Dependency) => {
      let run = () =>
        installDep(
          dep,
          { verbose, silent, threads: depThreads, ignoreTransitive },
          parentPkgPath,
          visited,
        );
      // Local deps stay outside the dedupe map: their cycle guard lives inside
      // installLocalDep, and awaiting a pending promise of your own ancestor
      // would turn a manifest cycle into a deadlock.
      let res = dep.path
        ? await run()
        : await dedupeInstall(depKey(dep, ignoreTransitive), run);
      if (!res) {
        ok = false;
      }
    };

    await parallel(poolSize, deps, install);
    return ok;
  };

  let scope = getInstallScope();
  if (scope) {
    // Transitive levels install one package at a time: every branch of the
    // graph is then a single chain, so the top-level pool alone bounds how
    // many packages are in flight however deep the graph goes.
    return installLevel(1, threads ?? scope.threads, visitedLocalDeps);
  }

  // The top level owns the retry: a transient network failure (connection
  // reset, fd exhaustion) is retried with the budget halved, so already
  // downloaded packages come from the cache and only the failures rerun.
  let budget = requestBudget(concurrency);
  for (let attempt = 1; ; attempt++) {
    // An explicit thread count still submits to the budget, so a halved
    // retry lowers real pressure even when `mops sources` pins 6 threads.
    let cappedThreads = threads ? Math.min(threads, budget) : undefined;
    let poolSize = packageConcurrency(deps.length, budget, cappedThreads);
    let depThreads = cappedThreads ?? fileThreadsPerPackage(poolSize, budget);
    let attemptScope = createInstallScope(depThreads);
    let ok = false;
    let thrown: unknown = undefined;
    try {
      // A fresh visited-set per attempt: an already visited local dep is
      // skipped entirely, which would hide its failed registry deps from
      // the retry.
      ok = await runInInstallScope(attemptScope, () =>
        installLevel(poolSize, depThreads, new Set(visitedLocalDeps)),
      );
    } catch (err) {
      thrown = err;
    }
    if (ok) {
      return true;
    }
    let retryBudget = nextRetryBudget(attemptScope, thrown, attempt, budget);
    if (retryBudget === undefined) {
      if (thrown !== undefined) {
        throw thrown;
      }
      return false;
    }
    budget = retryBudget;
  }
}
