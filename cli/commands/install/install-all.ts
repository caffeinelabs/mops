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
// call. Start one batched request for the root deps now, without awaiting it,
// so the round overlaps the downloads; per-package fetches coalesce with it
// and are answered from the memo. Best-effort on purpose: on failure the
// verification path fetches again and reports the error properly.
function prefetchFileHashes(deps: Dependency[], verbose?: boolean) {
  let depValues: Record<string, string> = {};
  for (let dep of deps) {
    let value = dep.version || dep.repo || dep.path;
    if (value) {
      depValues[dep.name] = value;
    }
  }
  let lockedHashes = readLockFile()?.hashes ?? {};
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
    prefetchFileHashes(allDeps, verbose);
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
