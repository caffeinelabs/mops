import { Dependency } from "../../types.js";
import { parallel } from "../../parallel.js";
import { getDepName } from "../../helpers/get-dep-name.js";
import { installDep } from "./install-dep.js";
import {
  createInstallScope,
  dedupeInstall,
  fileThreadsPerPackage,
  getInstallScope,
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
  let scope = getInstallScope();
  let poolSize: number;
  let depThreads: number;
  if (scope) {
    // Transitive levels install one package at a time: every branch of the
    // graph is then a single chain, so the top-level pool alone bounds how
    // many packages are in flight however deep the graph goes.
    poolSize = 1;
    depThreads = threads ?? scope.threads;
  } else {
    let budget = requestBudget(concurrency);
    poolSize = packageConcurrency(deps.length, budget, threads);
    depThreads = threads ?? fileThreadsPerPackage(poolSize, budget);
  }

  let ok = true;

  // A failed dependency does not abort the rest, same as the sequential loop
  // this replaced — every package gets its own error message.
  let install = async (dep: Dependency) => {
    let run = () =>
      installDep(
        dep,
        { verbose, silent, threads: depThreads, ignoreTransitive },
        parentPkgPath,
        visitedLocalDeps,
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

  let run = () => parallel(poolSize, deps, install);
  await (scope
    ? run()
    : runInInstallScope(createInstallScope(depThreads), run));

  return ok;
}
