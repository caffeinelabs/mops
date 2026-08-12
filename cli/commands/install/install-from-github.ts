import process from "node:process";
import { mkdirSync, mkdtempSync, rmSync, createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream";
import chalk from "chalk";
import { createLogUpdate } from "log-update";
import got from "got";
import {
  getGithubCommit,
  getRootDir,
  parseGithubURL,
  progressBar,
} from "../../mops.js";
import { extractGithubZip } from "../../helpers/extract-github-zip.js";
import {
  commitStagingDir,
  createStagingDir,
  getDepCacheDir,
  getGithubDepCacheName,
  isDepCached,
  sweepStaleStagingDirs,
} from "../../cache.js";
import {
  describeGithubHashMismatch,
  hashGithubDir,
  readLockedGithubDep,
  recordGithubDep,
} from "../../integrity.js";

export const downloadFromGithub = async (
  repo: string,
  dest: string,
  onProgress: any,
  // the commit to fetch, when the caller resolved one the repo url does not name
  ref?: string,
) => {
  const { branch, org, gitName, commitHash } = parseGithubURL(repo);

  const zipFile = `https://github.com/${org}/${gitName}/archive/${ref || commitHash || branch}.zip`;
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
        `${gitName}@${(ref || commitHash || branch).replaceAll("/", "___")}.zip`,
      );
      const cleanup = () => rmSync(tmpDir, { recursive: true, force: true });

      try {
        pipeline(readStream, createWriteStream(tmpFile), (err) => {
          if (err) {
            cleanup();
            reject(err);
          } else {
            try {
              resolve(extractGithubZip(tmpFile, dest));
            } catch (err) {
              reject(err);
            } finally {
              cleanup();
            }
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
  { verbose = false, silent = false } = {},
): Promise<boolean> => {
  sweepStaleStagingDirs();

  let cacheName = getGithubDepCacheName(name, repo);
  let cacheDir = getDepCacheDir(cacheName);
  let { org, gitName, branch, commitHash } = parseGithubURL(repo);

  let logUpdate = createLogUpdate(process.stdout, { showCursor: true });

  let locked = readLockedGithubDep(name, repo);

  // A ref that names no commit (`#main`, a tag) is only reproducible once it is
  // pinned: take the lock's commit, else resolve it once through the GitHub API.
  // Nothing asks the API when mops.toml or mops.lock already names a commit, so
  // the steady state costs zero requests against the 60/h anonymous limit.
  let resolved = commitHash || locked?.resolved || "";
  if (!resolved) {
    try {
      resolved = (await getGithubCommit(`${org}/${gitName}`, branch)).sha;
    } catch (err: any) {
      // Nothing honest to record without a commit: install as before and leave
      // mops.lock for a later run rather than pairing a hash with a guess.
      logUpdate.clear();
      console.warn(
        chalk.yellow("Warning: ") +
          `could not resolve ${repo} to a commit, so mops.lock cannot pin it: ${err.message}`,
      );
    }
  }

  let cached = isDepCached(cacheName);
  let cachedHash =
    cached && (locked || commitHash) ? hashGithubDir(cacheDir) : "";

  // What a cache hit is worth depends on what is known about it:
  //   locked        trust it only if the tree hashes to the locked hash
  //   commit in key the cache name names the commit, so the tree is what it says
  //   neither       unknown provenance under a moving ref — re-fetch, so the
  //                 commit recorded is the one the hash belongs to. Unless there
  //                 is no commit to fetch either (ref resolution failed), where
  //                 using the cache and recording nothing is what worked before.
  let useCache = cached;
  if (cached && locked) {
    useCache = cachedHash === locked.hash;
  } else if (cached && !commitHash && resolved) {
    useCache = false;
  }

  if (useCache) {
    silent || logUpdate(`Installing ${repo} (cache)`);
    if (resolved) {
      recordGithubDep(name, { resolved, hash: cachedHash });
    }
  } else {
    let progress = (step: number, total: number) => {
      silent || logUpdate(`Installing ${repo} ${progressBar(step, total)}`);
    };

    progress(0, 1024 * 500);

    // Stage download in a sibling dir; previously `mkdirSync(cacheDir)`
    // before download made empty dirs look cached to peers.
    let stagingDir = createStagingDir(cacheDir);
    try {
      await downloadFromGithub(repo, stagingDir, progress, resolved);

      // Integrity is checked here, on the tree that just arrived and before the
      // rename that publishes it, so a bad download cannot poison the cache.
      let hash = hashGithubDir(stagingDir);
      if (locked && hash !== locked.hash) {
        rmSync(stagingDir, { recursive: true, force: true });
        logUpdate.clear();
        let lines = describeGithubHashMismatch(name, repo, locked, hash);
        console.error(chalk.red("Error: ") + lines[0]);
        for (let line of lines.slice(1)) {
          console.error(line);
        }
        return false;
      }

      // The cache entry being replaced was keyed by a ref, not a commit, so it
      // may hold another commit's content; rename cannot overwrite it.
      if (cached) {
        rmSync(cacheDir, { recursive: true, force: true });
      }
      commitStagingDir(stagingDir, cacheDir);
      // The project copy is derived from the cache entry, and syncLocalCache
      // only copies when it is absent — so a replaced entry has to invalidate it.
      rmSync(path.join(getRootDir(), ".mops", cacheName), {
        recursive: true,
        force: true,
      });
      if (resolved) {
        recordGithubDep(name, { resolved, hash });
      }
    } catch (err) {
      rmSync(stagingDir, { recursive: true, force: true });
      // The commit came from the lock, so a failed fetch of it is worth naming:
      // a force-push or a deleted branch can garbage-collect it upstream.
      if (locked && !commitHash) {
        console.error(
          `mops.lock pins ${name} to commit ${locked.resolved}. If that commit is gone from the repository, run \`mops update ${name}\` to re-pin it.`,
        );
      }
      return false;
    }
  }

  if (verbose) {
    silent || logUpdate.done();
  } else {
    logUpdate.clear();
  }

  return true;
};
