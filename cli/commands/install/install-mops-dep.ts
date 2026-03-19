import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { Buffer } from "node:buffer";
import { createLogUpdate } from "log-update";
import chalk from "chalk";
import { deleteSync } from "del";
import { checkConfigFile, progressBar, readConfig } from "../../mops.js";
import { getHighestVersion } from "../../api/getHighestVersion.js";
import { storageActor } from "../../api/actors.js";
import { parallel } from "../../parallel.js";
import {
  getDepCacheDir,
  getMopsDepCacheName,
  isDepCached,
} from "../../cache.js";
import {
  downloadFile,
  getPackageFilesInfo,
} from "../../api/downloadPackageFiles.js";
import { installDeps } from "./install-deps.js";
import { getDepName } from "../../helpers/get-dep-name.js";

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
  threads = threads || 12;
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
    // GitHub Actions fails with "fetch failed" if there are multiple concurrent actions
    if (process.env.GITHUB_ENV) {
      threads = 4;
    }

    try {
      let { storageId, fileIds } = await getPackageFilesInfo(depName, version);

      total = fileIds.length + 2;

      let filesData = new Map();
      let storage = await storageActor(storageId);

      await parallel(threads, fileIds, async (fileId: string) => {
        let { path, data } = await downloadFile(storage, fileId);
        filesData.set(path, data);
        progress();
      });

      let onSigInt = () => {
        deleteSync([cacheDir], { force: true });
        process.exit();
      };
      process.on("SIGINT", onSigInt);

      // write files to global cache
      try {
        await Promise.all(
          Array.from(filesData.entries()).map(async ([filePath, data]) => {
            await fs.promises.mkdir(
              path.join(cacheDir, path.dirname(filePath)),
              { recursive: true },
            );
            await fs.promises.writeFile(
              path.join(cacheDir, filePath),
              Buffer.from(data),
            );
          }),
        );
      } catch (err) {
        console.error(chalk.red("Error: ") + err);
        deleteSync([cacheDir], { force: true });
        return false;
      }

      process.off("SIGINT", onSigInt);
    } catch (err) {
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
