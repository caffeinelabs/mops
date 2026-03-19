import process from "node:process";
import chalk from "chalk";
import { createLogUpdate } from "log-update";
import { checkConfigFile, parseDepValue, readConfig } from "../../mops.js";
import {
  checkIntegrity,
  checkLockFileLight,
  readLockFile,
} from "../../integrity.js";
import { installDeps } from "./install-deps.js";
import { checkRequirements } from "../../check-requirements.js";
import { syncLocalCache } from "./sync-local-cache.js";
import { notifyInstalls } from "../../notify-installs.js";

type InstallAllOptions = {
  verbose?: boolean;
  silent?: boolean;
  lock?: "check" | "update" | "ignore";
  threads?: number;
  installFromLockFile?: boolean;
};

export async function installAll({
  verbose = false,
  silent = false,
  threads,
  lock,
  installFromLockFile,
}: InstallAllOptions = {}): Promise<boolean> {
  if (!checkConfigFile()) {
    return false;
  }

  let config = readConfig();
  let deps = Object.values(config.dependencies || {});
  let devDeps = Object.values(config["dev-dependencies"] || {});
  let allDeps = [...deps, ...devDeps];
  let installedFromLockFile = false;

  // install from lock file to avoid installing intermediate dependencies
  if ((lock !== "ignore" || installFromLockFile) && checkLockFileLight()) {
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
        ignoreTransitive: true,
      });
      if (!ok) {
        return false;
      }
    }
  }

  if (!installedFromLockFile) {
    let ok = await installDeps(allDeps, { silent, verbose, threads });
    if (!ok) {
      return false;
    }
  }

  let logUpdate = createLogUpdate(process.stdout, { showCursor: true });

  if (!silent && lock !== "ignore") {
    logUpdate("Checking integrity...");
  }

  let installedPackages = await syncLocalCache({ verbose });

  await Promise.all([notifyInstalls(installedPackages), checkIntegrity(lock)]);

  if (!silent) {
    logUpdate.clear();
    await checkRequirements();
    console.log(chalk.green("Packages installed"));
  }

  return true;
}
