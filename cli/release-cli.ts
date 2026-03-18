/* eslint-disable no-undef */
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import { execSync } from "node:child_process";
import semver from "semver";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

import { findChangelogEntry } from "./helpers/find-changelog-entry.js";

let __dirname = new URL(".", import.meta.url).pathname;

if (!process.env.SKIP_BUILD) {
  execSync("./build.sh", { stdio: "inherit", cwd: __dirname });
}

let commitHash =
  process.env.COMMIT_HASH || execSync("git rev-parse HEAD").toString().trim();
let version = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "package.json"), "utf8"),
).version;
let major = semver.parse(version)?.major;
let tag = semver.parse(version)?.prerelease[0] || "latest";
let releaseNotes = findChangelogEntry(
  fs.readFileSync(path.resolve(__dirname, "CHANGELOG.md"), "utf8"),
  version,
);
let data = fs.readFileSync(path.resolve(__dirname, "bundle/cli.tgz"));
let hash = bytesToHex(sha256(data));
let size = data.byteLength;

console.log(`Commit hash of release: ${commitHash}`);

fs.cpSync(
  path.resolve(__dirname, "bundle/cli.tgz"),
  path.resolve(__dirname, `../cli-releases/versions/${version}.tgz`),
  { force: false, errorOnExist: true },
);

fs.cpSync(
  path.resolve(__dirname, `../cli-releases/versions/${version}.tgz`),
  path.resolve(__dirname, `../cli-releases/versions/${tag}.tgz`),
  { force: true, errorOnExist: false, recursive: true },
);
fs.cpSync(
  path.resolve(__dirname, `../cli-releases/versions/${version}.tgz`),
  path.resolve(__dirname, `../cli-releases/versions/${major}.tgz`),
  { force: true, errorOnExist: false, recursive: true },
);

fs.writeFileSync(
  path.resolve(__dirname, `../cli-releases/tags/${tag}`),
  version,
);

console.log(`Release '${version}' created with tag '${tag}'`);

// releases.json
type Releases = {
  tags: Record<string, string>;
  versions: Record<
    string,
    {
      time: number;
      size: number;
      hash: string;
      commitHash?: string;
      url: string;
      relseaseNotes: string;
    }
  >;
};

if (!fs.existsSync(path.resolve(__dirname, "../cli-releases/releases.json"))) {
  fs.writeFileSync(
    path.resolve(__dirname, "../cli-releases/releases.json"),
    JSON.stringify({ tags: {}, versions: {} }, null, 2),
  );
}

let releases: Releases = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../cli-releases/releases.json"),
    "utf8",
  ),
);

releases.tags[tag] = version;
releases.versions[version] = {
  time: new Date().getTime(),
  size,
  relseaseNotes: releaseNotes,
  commitHash: commitHash,
  url: `https://cli.mops.one/versions/${version}.tgz`,
  hash,
};

fs.writeFileSync(
  path.resolve(__dirname, "../cli-releases/releases.json"),
  JSON.stringify(releases, null, 2),
);
