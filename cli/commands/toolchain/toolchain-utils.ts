import path from "node:path";
import process from "node:process";
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
import {
  releaseRows,
  releaseTags,
  type ReleaseFilter,
  type ReleaseInfo,
} from "./release-tags.js";

export type { ReleaseFilter, ReleaseInfo } from "./release-tags.js";
export { releaseTags, releaseRows, sortReleaseTags } from "./release-tags.js";

export const TOOLCHAINS = [
  "moc",
  "wasmtime",
  "pocket-ic",
  "lintoko",
  "wasm-opt",
  "mo-fmt",
];

/** The machine a toolchain binary is fetched for, spelled as in Rust target triples. Each tool maps it onto its own asset names. */
export type Host = { os: "darwin" | "linux"; arch: "x86_64" | "aarch64" };

// Reads Node's own arch, so an x64 Node under Rosetta gets x86_64 tools to match.
export let hostTarget = (
  tool: string,
  {
    platform = process.platform as string,
    arch = process.arch as string,
    hint,
  }: { platform?: string; arch?: string; hint?: string } = {},
): Host => {
  let os: Host["os"] | undefined =
    platform === "darwin"
      ? "darwin"
      : platform === "linux"
        ? "linux"
        : undefined;
  if (!os) {
    let name = platform === "win32" ? "Windows" : platform;
    let fallbackHint = platform === "win32" ? " Please use WSL." : "";
    cliError(
      `${tool} has no ${name} build.${hint ? ` ${hint}` : fallbackHint}`,
    );
  }
  if (arch !== "x64" && arch !== "arm64") {
    cliError(`${tool} has no ${arch} build.${hint ? ` ${hint}` : ""}`);
  }
  return { os, arch: arch === "arm64" ? "aarch64" : "x86_64" };
};

/** The CPU a Mach-O or ELF executable was built for, read from its header. */
export let executableArch = (file: string): Host["arch"] | undefined => {
  let header = Buffer.alloc(20);
  let fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, header, 0, header.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (header.readUInt32LE(0) === 0xfeedfacf) {
    let cpu = header.readUInt32LE(4);
    return cpu === 0x01000007
      ? "x86_64"
      : cpu === 0x0100000c
        ? "aarch64"
        : undefined;
  }
  if (header.readUInt32BE(0) === 0x7f454c46) {
    let machine = header.readUInt16LE(18);
    return machine === 0x3e
      ? "x86_64"
      : machine === 0xb7
        ? "aarch64"
        : undefined;
  }
  return undefined;
};

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

export type ReleaseTagOptions = ReleaseFilter & {
  /** Fetch every release page instead of the first page only. */
  all?: boolean;
  /**
   * For a repo that releases several things: keep only tags with this prefix,
   * and strip it. Without it, a leading `v` is stripped and nothing dropped.
   */
  tagPrefix?: string;
};

let withExclusions = (tags: string[], exclude?: string[]): string[] => {
  return exclude && exclude.length > 0
    ? tags.filter((tag) => !exclude.includes(tag))
    : tags;
};

export type ReleaseTagsResult = {
  tags: string[];
  /** True when only the first page was fetched and GitHub may have more. */
  truncated: boolean;
  /**
   * First tag in GitHub publish order, matching `getLatestReleaseTag`. Modules
   * that filter `tags` further must drop it too, or the two disagree.
   */
  publishedLatest?: string;
};

// `undefined` for a tag that belongs to another release line of the repo.
let releaseVersion = (tag: string, tagPrefix?: string): string | undefined => {
  if (tagPrefix === undefined) {
    return tag.replace(/^v/, "");
  }
  return tag.startsWith(tagPrefix) ? tag.slice(tagPrefix.length) : undefined;
};

let fetchReleasePages = async (
  repo: string,
  { maxPages, tagPrefix }: { maxPages?: number; tagPrefix?: string } = {},
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
      let version = releaseVersion(release.tag_name, tagPrefix);
      if (version === undefined) {
        continue;
      }
      releases.push({
        tag_name: version,
        published_at: release.published_at,
        prerelease: release.prerelease,
        draft: release.draft,
      });
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
  {
    all = false,
    prerelease = false,
    exclude,
    tagPrefix,
  }: ReleaseTagOptions = {},
): Promise<ReleaseTagsResult> => {
  let { releases, truncated } = await fetchReleasePages(repo, {
    maxPages: all ? undefined : 1,
    tagPrefix,
  });
  let rows = releaseRows(releases, { prerelease, exclude });
  return {
    tags: withExclusions(releaseTags(releases, { prerelease }), exclude),
    truncated: all ? false : truncated,
    // Derived from the same filtered rows, so it can never name a tag that
    // `tags` leaves out.
    publishedLatest: rows[0]?.tag_name,
  };
};

export let getLatestReleaseTag = async (
  repo: string,
  { prerelease = false, exclude, tagPrefix }: ReleaseTagOptions = {},
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
      let tag = releaseVersion(release.tag_name, tagPrefix);
      if (tag === undefined || exclude?.includes(tag)) {
        continue;
      }
      if (!release.draft && (prerelease || !release.prerelease)) {
        return tag;
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
  { prerelease = false, exclude, tagPrefix }: ReleaseTagOptions = {},
): Promise<ReleaseInfo[]> => {
  // One page via `fetchReleasePages`, matching what `info` previews. A bare
  // unpaged request reads the same page but stops at GitHub's 1000-release cap.
  let { releases } = await fetchReleasePages(repo, {
    maxPages: 1,
    tagPrefix,
  });
  return releaseRows(releases, { prerelease, exclude });
};
