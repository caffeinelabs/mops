import path from "node:path";
import { Buffer } from "node:buffer";
import { unzipSync } from "node:zlib";
import { chmodSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import chalk from "chalk";
import fs from "fs-extra";
import { Octokit } from "octokit";
import { lock } from "proper-lockfile";
import { extract as extractTar } from "tar";

import { commitStagingDir, createStagingDir } from "../../cache.js";
import { cliError } from "../../error.js";
import { releaseRows, releaseTags, type ReleaseInfo } from "./release-tags.js";

export type { ReleaseInfo } from "./release-tags.js";
export { releaseTags, releaseRows, sortReleaseTags } from "./release-tags.js";

export const TOOLCHAINS = [
  "moc",
  "wasmtime",
  "pocket-ic",
  "lintoko",
  "wasm-opt",
];

export let tryDownloadFile = async (url: string): Promise<Buffer | null> => {
  let res = await fetch(url);

  if (!res.ok) {
    console.error(`HTTP ${res.status} ${url}`);
    return null;
  }

  let arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

// Extracts straight from memory: no archive on disk means nothing a
// concurrent `mops` process can clobber or delete from under this one.
// `destDir` is normally the staging dir handed out by `installVersion`.
export let downloadAndExtract = async (
  url: string,
  destDir: string,
  destFileName: string = "",
) => {
  let res = await fetch(url);

  if (res.status !== 200) {
    cliError(`ERROR ${res.status} ${url}`);
  }

  let arrayBuffer = await res.arrayBuffer();
  let buffer = Buffer.from(arrayBuffer);
  let archiveName = path.basename(url);

  fs.mkdirSync(destDir, { recursive: true });

  if (archiveName.endsWith(".xz")) {
    // Imported lazily so the xz WASM blob only loads for .xz archives.
    let xz = await import("xz-decompress");
    // xz-decompress is CJS: tsx exposes the class as a named export, plain
    // node ESM nests it under `default`.
    let XzReadableStream = xz.XzReadableStream ?? xz.default.XzReadableStream;
    // Toolchain .tar.xz archives wrap everything in one top-level directory,
    // so `strip: 1` lands their contents directly in destDir.
    await pipeline(
      Readable.fromWeb(
        new XzReadableStream(Readable.toWeb(Readable.from(buffer))),
      ),
      extractTar({ cwd: destDir, strip: 1 }),
    );
  } else if (archiveName.endsWith("tar.gz")) {
    await pipeline(Readable.from(buffer), extractTar({ cwd: destDir }));
  } else if (archiveName.endsWith(".gz")) {
    let destFile = path.join(
      destDir,
      destFileName || path.parse(archiveName).name,
    );
    fs.writeFileSync(destFile, unzipSync(buffer));
    chmodSync(destFile, 0o700);
  }
};

// A killed holder stops refreshing the lock's mtime; the next installer
// reclaims it after this long. Live holders refresh every half of it.
const INSTALL_LOCK_STALE_MS = 60_000;

// Installs one tool version into `destDir` exactly once across concurrent
// `mops` processes — icp-cli runs one `mops build <canister>` per canister
// in parallel, all on a cold cache. The winner populates a staging sibling
// and renames it into place, so `destDir` is either absent or complete and
// never a half-extracted binary a peer could exec. Losers wait on the lock
// and then find it cached.
export let installVersion = async (
  destDir: string,
  {
    label,
    isComplete,
    populate,
  }: {
    /** `<tool> <version>`, for the wait message. */
    label: string;
    isComplete: () => boolean;
    /** Fills the empty staging dir that becomes `destDir` on success. */
    populate: (stagingDir: string) => Promise<void>;
  },
) => {
  if (isComplete()) {
    return;
  }

  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  let release = await acquireInstallLock(destDir, label);
  try {
    // A peer finished the install while we waited.
    if (isComplete()) {
      return;
    }
    // A present-but-incomplete dir is a leftover from an interrupted
    // pre-staging install. Under the lock nobody else is writing it.
    fs.rmSync(destDir, { recursive: true, force: true });

    let staging = createStagingDir(destDir);
    try {
      await populate(staging);
    } catch (err) {
      fs.rmSync(staging, { recursive: true, force: true });
      throw err;
    }
    commitStagingDir(staging, destDir);
  } finally {
    await release().catch(() => {});
  }
};

// Cargo-style: fail the first acquire fast, announce the wait once, then
// retry with backoff. The lock lives at `<destDir>.lock` next to the
// version dir, so it needs no marker file and survives `destDir` appearing.
let acquireInstallLock = async (destDir: string, label: string) => {
  let options = { realpath: false, stale: INSTALL_LOCK_STALE_MS };
  try {
    return await lock(destDir, { ...options, retries: 0 });
  } catch (err: any) {
    if (err?.code !== "ELOCKED") {
      throw err;
    }
  }
  // stderr on purpose: `mops toolchain bin` prints the binary path on stdout
  // and callers command-substitute it.
  console.error(
    chalk.gray(`Waiting for another mops process to install ${label}...`),
  );
  try {
    return await lock(destDir, {
      ...options,
      retries: { retries: 240, minTimeout: 250, maxTimeout: 2_000 },
    });
  } catch (err: any) {
    cliError(
      `Failed to acquire the install lock for ${label} at ${destDir}.lock — another mops process may be stuck. Remove that directory to recover.${err?.message ? `\n${err.message}` : ""}`,
    );
  }
};

export type ReleaseTagOptions = {
  all?: boolean;
  prerelease?: boolean;
};

export type ReleaseTagsResult = {
  tags: string[];
  /** True when only the first page was fetched and GitHub may have more. */
  truncated: boolean;
  /** First release in GitHub publish order, if any. */
  publishedLatest?: string;
};

let mapRelease = (release: {
  tag_name: string;
  published_at: string | null;
  prerelease: boolean;
  draft: boolean;
}): ReleaseInfo => ({
  tag_name: release.tag_name.replace(/^v/, ""),
  published_at: release.published_at,
  prerelease: release.prerelease,
  draft: release.draft,
});

let fetchReleasePages = async (
  repo: string,
  { maxPages }: { maxPages?: number } = {},
): Promise<{ releases: ReleaseInfo[]; truncated: boolean }> => {
  let octokit = new Octokit();
  let releases: ReleaseInfo[] = [];
  let truncated = false;

  for (let page = 1; ; page++) {
    if (maxPages !== undefined && page > maxPages) {
      truncated = true;
      break;
    }

    let res = await octokit.request(`GET /repos/${repo}/releases`, {
      per_page: 100,
      page,
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (res.status !== 200) {
      cliError("Releases fetch error");
    }
    if (res.data.length === 0) {
      break;
    }
    for (let release of res.data) {
      releases.push(mapRelease(release));
    }
    if (res.data.length < 100) {
      break;
    }
    if (maxPages !== undefined && page >= maxPages) {
      truncated = true;
      break;
    }
  }

  return { releases, truncated };
};

/** Release tags, newest first. Default: first GitHub page only. */
export let getReleaseTags = async (
  repo: string,
  { all = false, prerelease = false }: ReleaseTagOptions = {},
): Promise<ReleaseTagsResult> => {
  let { releases, truncated } = await fetchReleasePages(repo, {
    maxPages: all ? undefined : 1,
  });
  let rows = releaseRows(releases, { prerelease });
  return {
    tags: releaseTags(releases, { prerelease }),
    truncated: all ? false : truncated,
    publishedLatest: rows[0]?.tag_name,
  };
};

export let getLatestReleaseTag = async (
  repo: string,
  { prerelease = false } = {},
): Promise<string> => {
  let octokit = new Octokit();

  for (let page = 1; ; page++) {
    let res = await octokit.request(`GET /repos/${repo}/releases`, {
      per_page: 100,
      page,
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (res.status !== 200) {
      cliError("Releases fetch error");
    }
    if (res.data.length === 0) {
      break;
    }
    for (let release of res.data) {
      if (!release.draft && (prerelease || !release.prerelease)) {
        return release.tag_name.replace(/^v/, "");
      }
    }
    if (res.data.length < 100) {
      break;
    }
  }

  cliError(`Failed to fetch latest release tag for ${repo}`);
};

/**
 * Recent release rows, newest first, for prompts and the `info` preview.
 * Drafts and prereleases are excluded unless asked for explicitly.
 */
export let getReleases = async (
  repo: string,
  { prerelease = false } = {},
): Promise<ReleaseInfo[]> => {
  let octokit = new Octokit();
  let res = await octokit.request(`GET /repos/${repo}/releases`, {
    per_page: 100,
    headers: {
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (res.status !== 200) {
    cliError("Releases fetch error");
  }
  return releaseRows(res.data.map(mapRelease), { prerelease });
};
