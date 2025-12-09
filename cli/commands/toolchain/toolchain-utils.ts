import process from "node:process";
import path from "node:path";
import { Buffer } from "node:buffer";
import { unzipSync } from "node:zlib";
import { chmodSync } from "node:fs";
import fs from "fs-extra";
import decompress from "decompress";
// import decompressTarxz from 'decomp-tarxz';
import { deleteSync } from "del";
import { Octokit } from "octokit";
import { extract as extractTar } from "tar";

import { getRootDir } from "../../mops.js";

export let tryDownloadFile = async (url: string): Promise<Buffer | null> => {
  let res = await fetch(url);

  if (!res.ok) {
    console.error(`HTTP ${res.status} ${url}`);
    return null;
  }

  let arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

export let downloadAndExtract = async (
  url: string,
  destDir: string,
  destFileName: string = "",
) => {
  let res = await fetch(url);

  if (res.status !== 200) {
    console.error(`ERROR ${res.status} ${url}`);
    process.exit(1);
  }

  let arrayBuffer = await res.arrayBuffer();
  let buffer = Buffer.from(arrayBuffer);

  let tmpDir = path.join(getRootDir(), ".mops", "_tmp");
  let archive = path.join(tmpDir, path.basename(url));

  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(archive, buffer);

  fs.mkdirSync(destDir, { recursive: true });

  if (archive.endsWith(".xz")) {
    let decompressTarxz = await import("decomp-tarxz");
    await decompress(archive, tmpDir, {
      plugins: [decompressTarxz.default()],
    }).catch(() => {
      deleteSync([tmpDir]);
    });
    fs.cpSync(
      path.join(tmpDir, path.parse(archive).name.replace(".tar", "")),
      destDir,
      { recursive: true },
    );
  } else if (archive.endsWith("tar.gz")) {
    await extractTar({
      file: archive,
      cwd: destDir,
    });
  } else if (archive.endsWith(".gz")) {
    let destFile = path.join(destDir, destFileName || path.parse(archive).name);
    fs.writeFileSync(destFile, unzipSync(buffer));
    chmodSync(destFile, 0o700);
  }

  deleteSync([tmpDir], { force: true });
};

export let getLatestReleaseTag = async (repo: string): Promise<string> => {
  let releases = await getReleases(repo);
  let release = releases.find(
    (release: any) => !release.prerelease && !release.draft,
  );
  if (!release?.tag_name) {
    console.error(`Failed to fetch latest release tag for ${repo}`);
    process.exit(1);
  }
  return release.tag_name.replace(/^v/, "");
};

export let getReleases = async (repo: string) => {
  let octokit = new Octokit();
  let res = await octokit.request(`GET /repos/${repo}/releases`, {
    per_page: 10,
    headers: {
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (res.status !== 200) {
    console.log("Releases fetch error");
    process.exit(1);
  }
  return res.data.map((release: any) => {
    return {
      ...release,
      tag_name: release.tag_name.replace(/^v/, ""),
    };
  });
};
