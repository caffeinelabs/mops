import { Dependency } from "../../types.js";
import { parallel } from "../../parallel.js";
import { installDep } from "./install-dep.js";
import {
  createInstallScope,
  dedupeInstall,
  fileThreadsPerPackage,
  getInstallScope,
  packageConcurrency,
  runInInstallScope,
} from "./install-concurrency.js";

type InstallDepsOptions = {
  verbose?: boolean;
  silent?: boolean;
  threads?: number;
  ignoreTransitive?: boolean;
};

// Identifies the work, not the declaration: two packages asking for the same
// version are one install. A local path resolves against its parent, so the
// parent belongs in the key.
function depKey(
  dep: Dependency,
  ignoreTransitive?: boolean,
  parentPkgPath?: string,
): string {
  let source = dep.repo
    ? dep.repo
    : dep.path
      ? `${parentPkgPath || ""}:${dep.path}`
      : dep.version;
  return `${dep.name}|${source}|${ignoreTransitive ? 1 : 0}`;
}

// install all dependencies
// returns actual installed dependencies
// returns false if failed
export async function installDeps(
  deps: Dependency[],
  { verbose, silent, threads, ignoreTransitive }: InstallDepsOptions = {},
  parentPkgPath?: string,
): Promise<boolean> {
  let scope = getInstallScope();
  // Transitive levels install one package at a time: every branch of the graph
  // is then a single chain, so the top-level pool alone bounds how many
  // packages are in flight however deep the graph goes.
  let concurrency = scope ? 1 : packageConcurrency(deps.length, threads);
  let depThreads =
    threads ?? scope?.threads ?? fileThreadsPerPackage(concurrency);

  let ok = true;

  // A failed dependency does not abort the rest, same as the sequential loop
  // this replaced — every package gets its own error message.
  let install = async (dep: Dependency) => {
    let res = await dedupeInstall(
      depKey(dep, ignoreTransitive, parentPkgPath),
      () =>
        installDep(
          dep,
          { verbose, silent, threads: depThreads, ignoreTransitive },
          parentPkgPath,
        ),
    );
    if (!res) {
      ok = false;
    }
  };

  let run = () => parallel(concurrency, deps, install);
  await (scope
    ? run()
    : runInInstallScope(createInstallScope(depThreads), run));

  return ok;
}
