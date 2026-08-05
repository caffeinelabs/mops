import process from "node:process";
import { mkdirSync, mkdtempSync, rmSync, createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream";
import chalk from "chalk";
import { createLogUpdate } from "log-update";
import got from "got";
import decompress from "decompress";
import { getRootDir, parseGithubURL, progressBar } from "../../mops.js";
import {
  commitStagingDir,
  createStagingDir,
  getDepCacheDir,
  getGithubDepCacheName,
  isDepCached,
  sweepStaleStagingDirs,
} from "../../cache.js";
import { readVesselConfig } from "../../vessel.js";

export const downloadFromGithub = async (
  repo: string,
  dest: string,
  onProgress: any,
) => {
  const { branch, org, gitName, commitHash } = parseGithubURL(repo);

  const zipFile = `https://github.com/${org}/${gitName}/archive/${commitHash || branch}.zip`;
  const readStream = got.stream(zipFile);

  const promise = new Promise((resolve, reject) => {
    readStream.on("error", (err) => {
      console.error(
        chalk.red(`Error: failed to download from GitHub: ${zipFile}`),
      );
      console.error(err.message);
      reject(err);
    });

    readStream.on("downloadProgress", ({ transferred, total }) => {
      onProgress?.(transferred, total || 2 * 1024 ** 2);
    });

    readStream.on("response", (response) => {
      if (response.headers.age > 3600) {
        console.error(chalk.red("Error: ") + "Failure - response too old");
        readStream.destroy(); // Destroy the stream to prevent hanging resources.
        reject();
        return;
      }

      // Prevent `onError` being called twice.
      readStream.off("error", reject);

      // Per-invocation download dir (was a shared `.mops/_tmp/` clobbered
      // by concurrent github installs). `.staging-` prefix lets the sweeper
      // pick up leftovers from a crashed download.
      const parentTmp = path.resolve(getRootDir(), ".mops");
      mkdirSync(parentTmp, { recursive: true });
      const tmpDir = mkdtempSync(path.join(parentTmp, ".staging-github-dl-"));
      const tmpFile = path.resolve(
        tmpDir,
        `${gitName}@${(commitHash || branch).replaceAll("/", "___")}.zip`,
      );
      const cleanup = () => rmSync(tmpDir, { recursive: true, force: true });

      try {
        pipeline(readStream, createWriteStream(tmpFile), (err) => {
          if (err) {
            cleanup();
            reject(err);
          } else {
            let options = {
              extract: true,
              strip: 1,
              headers: {
                accept: "application/zip",
              },
            };
            decompress(tmpFile, dest, options)
              .then((unzippedFiles) => {
                cleanup();
                resolve(unzippedFiles);
              })
              .catch((err) => {
                cleanup();
                reject(err);
              });
          }
        });
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  });

  return promise;
};

export const installFromGithub = async (
  name: string,
  repo: string,
  {
    verbose = false,
    dep = false,
    silent = false,
    ignoreTransitive = false,
  } = {},
): Promise<boolean> => {
  sweepStaleStagingDirs();

  let cacheName = getGithubDepCacheName(name, repo);
  let cacheDir = getDepCacheDir(cacheName);

  let logUpdate = createLogUpdate(process.stdout, { showCursor: true });

  if (isDepCached(cacheName)) {
    silent || logUpdate(`${dep ? "Dependency" : "Installing"} ${repo} (cache)`);
  } else {
    let progress = (step: number, total: number) => {
      silent ||
        logUpdate(
          `${dep ? "Dependency" : "Installing"} ${repo} ${progressBar(step, total)}`,
        );
    };

    progress(0, 1024 * 500);

    // Stage download in a sibling dir; previously `mkdirSync(cacheDir)`
    // before download made empty dirs look cached to peers.
    let stagingDir = createStagingDir(cacheDir);
    try {
      await downloadFromGithub(repo, stagingDir, progress);
      commitStagingDir(stagingDir, cacheDir);
    } catch (err) {
      rmSync(stagingDir, { recursive: true, force: true });
      return false;
    }
  }

  if (verbose) {
    silent || logUpdate.done();
  } else {
    logUpdate.clear();
  }

  if (ignoreTransitive) {
    return true;
  }

  const config = await readVesselConfig(cacheDir, { silent });

  if (config) {
    for (const { name, repo } of config.dependencies) {
      if (repo) {
        await installFromGithub(name, repo, { verbose, silent, dep: true });
      }
    }
  }

  return true;
};
