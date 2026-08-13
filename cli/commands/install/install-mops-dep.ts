import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { Buffer } from "node:buffer";
import { createLogUpdate } from "log-update";
import chalk from "chalk";
import { checkConfigFile, progressBar, readConfig } from "../../mops.js";
import { getHighestVersion } from "../../api/getHighestVersion.js";
import { storageActor } from "../../api/actors.js";
import { parallel } from "../../parallel.js";
import {
  commitStagingDir,
  createStagingDir,
  getDepCacheDir,
  getMopsDepCacheName,
  isDepCached,
  sweepStaleStagingDirs,
} from "../../cache.js";
import {
  downloadFile,
  getPackageFilesInfo,
} from "../../api/downloadPackageFiles.js";
import { installDeps } from "./install-deps.js";
import {
  fileThreadsPerPackage,
  noteTransientNetworkError,
} from "./install-concurrency.js";
import { getDepName } from "../../helpers/get-dep-name.js";
import { verifyDownloadedPackageFiles } from "../../integrity.js";

// Each task holds one file descriptor, so an unbounded fan-out over a large
// package can hit the FD soft limit; pnpm bounds its fs pools the same way.
const FS_WRITE_CONCURRENCY = 16;

type InstallMopsDepOptions = {
  verbose?: boolean;
  silent?: boolean;
  dep?: boolean;
  threads?: number;
  ignoreTransitive?: boolean;
};

export async function installMopsDep(
  pkg: string,
  version = "",
  {
    verbose,
    silent,
    dep,
    threads,
    ignoreTransitive,
  }: InstallMopsDepOptions = {},
): Promise<boolean> {
  // Direct calls install a single package, so it gets the whole budget;
  // installDeps passes each pool member its share instead.
  threads = threads || fileThreadsPerPackage(1);
  let depName = getDepName(pkg);

  if (!checkConfigFile()) {
    return false;
  }
  let logUpdate = createLogUpdate(process.stdout, { showCursor: true });

  // progress
  let total = Infinity;
  let step = 0;
  let progress = () => {
    step++;
    silent ||
      logUpdate(
        `${dep ? "Dependency" : "Installing"} ${depName}@${version} ${progressBar(step, total)}`,
      );
  };
  progress();

  if (!version) {
    let versionRes = await getHighestVersion(depName);
    if ("err" in versionRes) {
      console.log(chalk.red("Error: ") + versionRes.err);
      return false;
    }
    version = versionRes.ok;
  }

  sweepStaleStagingDirs();

  let cacheName = getMopsDepCacheName(depName, version);
  let cacheDir = getDepCacheDir(cacheName);

  // global cache hit
  if (isDepCached(cacheName)) {
    silent ||
      logUpdate(
        `${dep ? "Dependency" : "Installing"} ${depName}@${version} (cache)`,
      );
  }
  // download
  else {
    try {
      let { storageId, fileIds } = await getPackageFilesInfo(depName, version);

      total = fileIds.length + 2;

      let filesData = new Map<string, Uint8Array>();
      let storage = await storageActor(storageId);

      await parallel(threads, fileIds, async (fileId: string) => {
        let { path, data } = await downloadFile(storage, fileId);
        filesData.set(path, data);
        progress();
      });

      // Integrity is checked here, once, on the bytes that just arrived —
      // nothing reaches the cache unless it matches the registry's hashes.
      let verification = await verifyDownloadedPackageFiles(
        cacheName,
        filesData,
      );
      if (verification.errors.length) {
        logUpdate.clear();
        console.error(
          chalk.red("Error: ") +
            `integrity check failed for ${depName}@${version}`,
        );
        for (let error of verification.errors) {
          console.error("  " + error);
        }
        return false;
      }
      if (verification.unverified && !silent) {
        logUpdate.clear();
        console.warn(
          chalk.yellow("Warning: ") +
            `${depName}@${version} publishes no file hashes, so its contents could not be verified`,
        );
      }

      let stagingDir = createStagingDir(cacheDir);
      let onSigInt = () => {
        fs.rmSync(stagingDir, { recursive: true, force: true });
        process.exit(130);
      };
      process.on("SIGINT", onSigInt);

      try {
        // A halved-budget retry after EMFILE must lower write pressure too,
        // so the pool follows the package's thread share down.
        await parallel(
          Math.min(FS_WRITE_CONCURRENCY, threads * 4),
          Array.from(filesData.entries()),
          async ([filePath, data]) => {
            await fs.promises.mkdir(
              path.join(stagingDir, path.dirname(filePath)),
              { recursive: true },
            );
            await fs.promises.writeFile(
              path.join(stagingDir, filePath),
              Buffer.from(data),
            );
          },
        );
        commitStagingDir(stagingDir, cacheDir);
      } catch (err) {
        noteTransientNetworkError(err);
        console.error(chalk.red("Error: ") + err);
        fs.rmSync(stagingDir, { recursive: true, force: true });
        return false;
      } finally {
        process.off("SIGINT", onSigInt);
      }
    } catch (err) {
      noteTransientNetworkError(err);
      console.error(chalk.red("Error: ") + err);
      return false;
    }

    progress();
  }

  if (verbose) {
    silent || logUpdate.done();
  } else {
    logUpdate.clear();
  }

  // install dependencies
  if (!ignoreTransitive) {
    let config = readConfig(path.join(cacheDir, "mops.toml"));
    let res = await installDeps(Object.values(config.dependencies || {}), {
      silent,
      verbose,
    });

    if (!res) {
      return false;
    }
  }

  return true;
}
