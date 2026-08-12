import { Dependency } from "../../types.js";
import { installDep } from "./install-dep.js";

type InstallDepsOptions = {
  verbose?: boolean;
  silent?: boolean;
  threads?: number;
  ignoreTransitive?: boolean;
};

// install all dependencies
// returns actual installed dependencies
// returns false if failed
export async function installDeps(
  deps: Dependency[],
  { verbose, silent, threads, ignoreTransitive }: InstallDepsOptions = {},
  parentPkgPath?: string,
  // Local `path` deps already walked in this run, by resolved directory. A
  // default here means every top-level caller starts a fresh run, and only the
  // recursion below carries one along.
  visitedLocalDeps: Set<string> = new Set(),
): Promise<boolean> {
  let ok = true;

  for (const dep of deps) {
    let res = await installDep(
      dep,
      { verbose, silent, threads, ignoreTransitive },
      parentPkgPath,
      visitedLocalDeps,
    );
    if (!res) {
      ok = false;
    }
  }

  return ok;
}
