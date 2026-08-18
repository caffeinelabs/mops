import process from "node:process";
import chalk from "chalk";
import { createLogUpdate } from "log-update";
import { checkConfigFile, parseDepValue, readConfig } from "../../mops.js";
import {
  checkIntegrity,
  checkLockedPrerequisites,
  checkLockFileLight,
  fetchRegistryFileHashes,
  LockPolicy,
  mopsPackageIds,
  readLockFile,
} from "../../integrity.js";
import { Dependency } from "../../types.js";
import { installDeps } from "./install-deps.js";
import { checkRequirements } from "../../check-requirements.js";
import { syncLocalCache } from "./sync-local-cache.js";
import { notifyInstalls } from "../../notify-installs.js";
import { cliError } from "../../error.js";

// Each freshly downloaded package the lock cannot vouch for must ask the
// registry for its file hashes before entering the cache — a ~2s consensus
// call. Start one batched request now, without awaiting it, so the round
// overlaps the downloads; the per-package fetches for those ids are then
// answered from the memo.
//
// A stale lock is still worth reading: its `deps` name the transitive packages
// of the previous resolution, and that is the only way to know them before the
// install walk discovers them one parent at a time. Ids it names that this
// resolution ends up dropping cost nothing — the round carries them for free.
// Ids the lock already records hashes for are dropped instead: those never
// reach the registry, neither when a download verifies nor when the lock is
// rewritten. That is also why the global cache is not consulted here — a cached
// package missing from the lock still needs its hashes at lock-write time.
//
// Best-effort, but not isolated: a verification that joins a failed batch
// inherits its rejection. Safe because `installDeps` retries and the retry
// fetches afresh, which is where the error gets reported.
function prefetchFileHashes(deps: Dependency[], verbose?: boolean) {
  let lock = readLockFile();
  let depValues: Record<string, string> = {
    ...(lock?.version === 3 ? lock.deps : {}),
  };
  for (let dep of deps) {
    let value = dep.version || dep.repo || dep.path;
    if (value) {
      depValues[dep.name] = value;
    }
  }
  let lockedHashes = lock?.hashes ?? {};
  let packageIds = mopsPackageIds(depValues).filter(
    (packageId) => !Object.keys(lockedHashes[packageId] ?? {}).length,
  );
  if (packageIds.length) {
    fetchRegistryFileHashes(packageIds).catch((err) => {
      verbose && console.log(`Failed to prefetch registry file hashes: ${err}`);
    });
  }
}

type InstallAllOptions = {
  verbose?: boolean;
  silent?: boolean;
  lock?: LockPolicy;
  threads?: number;
  concurrency?: number;
};

export async function installAll({
  verbose = false,
  silent = false,
  threads,
  concurrency,
  lock = "maintain",
}: InstallAllOptions = {}): Promise<boolean> {
  checkConfigFile();

  // Fail before downloading anything: a missing or stale lock under `--locked`
  // is not going to become valid by installing.
  if (lock === "locked") {
    checkLockedPrerequisites();
    // Belt and braces for the invariant documented on checkLockFileLight: if
    // the prerequisites ever accept a lock the light check rejects, we would
    // install by re-resolving mops.toml instead of from the lock, which is
    // exactly what `--locked` exists to prevent. Fail loudly instead.
    if (!checkLockFileLight()) {
      cliError(
        "Error: mops.lock passed the --locked checks but is not usable for installation.\n" +
          "This is a bug in mops; please report it.",
      );
    }
  }

  let config = readConfig();
  let deps = Object.values(config.dependencies || {});
  let devDeps = Object.values(config["dev-dependencies"] || {});
  let allDeps = [...deps, ...devDeps];
  let installedFromLockFile = false;

  // install from lock file to avoid installing intermediate dependencies
  if (checkLockFileLight()) {
    let lockFileJson = readLockFile();

    if (lockFileJson && lockFileJson.version === 3) {
      verbose && console.log("Installing from lock file...");
      installedFromLockFile = true;
      let lockedDeps = Object.entries(lockFileJson.deps).map(
        ([name, version]) => {
          return parseDepValue(name, version);
        },
      );
      let ok = await installDeps(lockedDeps, {
        silent,
        verbose,
        threads,
        concurrency,
        ignoreTransitive: true,
      });
      if (!ok) {
        return false;
      }
    }
  }

  if (!installedFromLockFile) {
    // Under "skip" nothing is waiting for the answer: no lock gets written, and
    // a package already in the cache never downloads and so never verifies. The
    // un-awaited call would just hold the event loop open, turning an offline
    // `mops sources` — which sits on the build critical path — into a ~2s one.
    // On a cold cache the downloads still verify, batched among themselves;
    // only the overlap is given up.
    if (lock !== "skip") {
      prefetchFileHashes(allDeps, verbose);
    }
    let ok = await installDeps(allDeps, {
      silent,
      verbose,
      threads,
      concurrency,
    });
    if (!ok) {
      return false;
    }
  }

  let logUpdate = createLogUpdate(process.stdout, { showCursor: true });

  if (!silent && lock !== "skip") {
    logUpdate("Checking integrity...");
  }

  let installedPackages = await syncLocalCache({ verbose });

  await Promise.all([
    notifyInstalls(installedPackages),
    checkIntegrity(lock, { silent }),
  ]);

  if (!silent) {
    logUpdate.clear();
    await checkRequirements();
    console.log(chalk.green("Packages installed"));
  }

  return true;
}
