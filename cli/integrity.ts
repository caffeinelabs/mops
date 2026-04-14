import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { getDependencyType, getRootDir, readConfig } from "./mops.js";
import { mainActor } from "./api/actors.js";
import { resolvePackages } from "./resolve-packages.js";
import { getPackageId } from "./helpers/get-package-id.js";

type LockFileGeneric = {
  version: number;
};

type LockFileV1 = {
  version: 1;
  mopsTomlHash: string;
  hashes: Record<string, Record<string, string>>;
};

type LockFileV2 = {
  version: 2;
  mopsTomlDepsHash: string;
  hashes: Record<string, Record<string, string>>;
};

type LockFileV3 = {
  version: 3;
  mopsTomlDepsHash: string;
  hashes: Record<string, Record<string, string>>;
  deps: Record<string, string>;
};

type LockFileV4 = {
  version: 4;
  mopsTomlDepsHash: string;
  hashes: Record<string, Record<string, string>>;
  blobHashes: Record<string, string>;
  deps: Record<string, string>;
};

type LockFile = LockFileV1 | LockFileV2 | LockFileV3 | LockFileV4;

export async function checkIntegrity(lock?: "check" | "update" | "ignore") {
  let force = !!lock;

  if (!lock) {
    lock = process.env["CI"] ? "check" : "update";
  }

  if (lock === "update") {
    await updateLockFile();
    await checkLockFile(force);
  } else if (lock === "check") {
    await checkLockFile(force);
  }
}

async function getFileHashesFromRegistry(): Promise<
  [string, [string, Uint8Array | number[]][]][]
> {
  let packageIds = await getResolvedMopsPackageIds();
  let actor = await mainActor();
  let fileHashesByPackageIds =
    await actor.getFileHashesByPackageIds(packageIds);
  return fileHashesByPackageIds;
}

async function getBlobHashesFromRegistry(): Promise<Record<string, string>> {
  let packageIds = await getResolvedMopsPackageIds();
  let actor = await mainActor();
  let blobHashes: Record<string, string> = {};

  await Promise.all(
    packageIds.map(async (packageId) => {
      let [name, version] = packageId.split("@");
      if (!name || !version) {
        return;
      }
      let result = await actor.getBlobHash(name, version);
      if (result.length > 0 && result[0]) {
        blobHashes[packageId] = result[0];
      }
    }),
  );

  return blobHashes;
}

async function getResolvedMopsPackageIds(): Promise<string[]> {
  let resolvedPackages = await resolvePackages();
  let packageIds = Object.entries(resolvedPackages)
    .filter(([_, version]) => getDependencyType(version) === "mops")
    .map(([name, version]) => getPackageId(name, version));
  return packageIds;
}

// get hash of local file from '.mops' dir by fileId
export function getLocalFileHash(fileId: string): string {
  let rootDir = getRootDir();
  let file = path.join(rootDir, ".mops", fileId);
  if (!fs.existsSync(file)) {
    console.error(`Missing file ${fileId} in .mops dir`);
    process.exit(1);
  }
  let fileData = fs.readFileSync(file);
  return bytesToHex(sha256(fileData));
}

function getMopsTomlHash(): string {
  return bytesToHex(
    sha256(fs.readFileSync(path.join(getRootDir(), "mops.toml"))),
  );
}

function getMopsTomlDepsHash(): string {
  let config = readConfig();
  let deps = config.dependencies || {};
  let devDeps = config["dev-dependencies"] || {};
  let allDeps = { ...deps, ...devDeps };
  // sort allDeps by key
  let sortedDeps = Object.keys(allDeps)
    .sort()
    .reduce(
      (acc, key) => {
        acc[key] =
          allDeps[key]?.version ||
          allDeps[key]?.repo ||
          allDeps[key]?.path ||
          "";
        return acc;
      },
      {} as Record<string, string>,
    );
  return bytesToHex(sha256(JSON.stringify(sortedDeps)));
}

// compare hashes of local files with hashes from the registry
export async function checkRemote() {
  let fileHashesFromRegistry = await getFileHashesFromRegistry();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (let [_packageId, fileHashes] of fileHashesFromRegistry) {
    for (let [fileId, hash] of fileHashes) {
      let remoteHash = new Uint8Array(hash);
      let localHash = getLocalFileHash(fileId);

      if (localHash !== bytesToHex(remoteHash)) {
        console.error("Integrity check failed.");
        console.error(
          `Mismatched hash for ${fileId}: ${localHash} vs ${bytesToHex(remoteHash)}`,
        );
        process.exit(1);
      }
    }
  }
}

export function readLockFile(): LockFile | null {
  let rootDir = getRootDir();
  let lockFile = path.join(rootDir, "mops.lock");
  if (fs.existsSync(lockFile)) {
    try {
      return JSON.parse(fs.readFileSync(lockFile).toString()) as LockFile;
    } catch {
      console.error(
        "mops.lock is corrupted. Delete it and run `mops install` to regenerate.",
      );
      process.exit(1);
    }
  }
  return null;
}

// check if lock file exists and integrity of mopsTomlDepsHash
export function checkLockFileLight(): boolean {
  let existingLockFileJson = readLockFile();
  if (existingLockFileJson) {
    let mopsTomlDepsHash = getMopsTomlDepsHash();
    if (
      (existingLockFileJson.version === 3 ||
        existingLockFileJson.version === 4) &&
      mopsTomlDepsHash === existingLockFileJson.mopsTomlDepsHash
    ) {
      return true;
    }
  }
  return false;
}

export async function updateLockFile() {
  if (checkLockFileLight()) {
    return;
  }

  let resolvedDeps = await resolvePackages();

  let [fileHashes, blobHashes] = await Promise.all([
    getFileHashesFromRegistry(),
    getBlobHashesFromRegistry(),
  ]);

  let blobPackageIds = new Set(Object.keys(blobHashes));

  let lockFileJson: LockFileV4 = {
    version: 4,
    mopsTomlDepsHash: getMopsTomlDepsHash(),
    deps: resolvedDeps,
    hashes: fileHashes.reduce(
      (acc, [packageId, fileHashes]) => {
        if (blobPackageIds.has(packageId)) {
          return acc;
        }
        acc[packageId] = fileHashes.reduce(
          (acc, [fileId, hash]) => {
            acc[fileId] = bytesToHex(new Uint8Array(hash));
            return acc;
          },
          {} as Record<string, string>,
        );
        return acc;
      },
      {} as Record<string, Record<string, string>>,
    ),
    blobHashes,
  };

  let rootDir = getRootDir();
  let lockFile = path.join(rootDir, "mops.lock");
  let isNew = !fs.existsSync(lockFile);
  fs.writeFileSync(lockFile, JSON.stringify(lockFileJson, null, 2));
  if (isNew) {
    console.log("mops.lock created.");
    console.log("  Applications: commit this file.");
    console.log("  Libraries: add mops.lock to .gitignore.");
  }
}

// compare hashes of local files with hashes from the lock file
export async function checkLockFile(force = false) {
  let supportedVersions = [1, 2, 3, 4];
  let rootDir = getRootDir();
  let lockFile = path.join(rootDir, "mops.lock");

  if (!fs.existsSync(lockFile)) {
    if (force) {
      console.error("Missing lock file. Run `mops install` to generate it.");
      process.exit(1);
    }
    return;
  }

  let lockFileJsonGeneric: LockFileGeneric = JSON.parse(
    fs.readFileSync(lockFile).toString(),
  );
  let packageIds = await getResolvedMopsPackageIds();

  if (!supportedVersions.includes(lockFileJsonGeneric.version)) {
    console.error("Integrity check failed");
    console.error(
      `Invalid lock file version: ${lockFileJsonGeneric.version}. Supported versions: ${supportedVersions.join(", ")}`,
    );
    process.exit(1);
  }

  let lockFileJson = lockFileJsonGeneric as LockFile;

  // V1: check mops.toml hash
  if (lockFileJson.version === 1) {
    if (lockFileJson.mopsTomlHash !== getMopsTomlHash()) {
      console.error("Integrity check failed");
      console.error("Mismatched mops.toml hash");
      console.error(`Locked hash: ${lockFileJson.mopsTomlHash}`);
      console.error(`Actual hash: ${getMopsTomlHash()}`);
      process.exit(1);
    }
  }

  // V2, V3, V4: check mops.toml deps hash
  if (
    lockFileJson.version === 2 ||
    lockFileJson.version === 3 ||
    lockFileJson.version === 4
  ) {
    if (lockFileJson.mopsTomlDepsHash !== getMopsTomlDepsHash()) {
      console.error("Integrity check failed");
      console.error("Mismatched mops.toml dependencies hash");
      console.error(`Locked hash: ${lockFileJson.mopsTomlDepsHash}`);
      console.error(`Actual hash: ${getMopsTomlDepsHash()}`);
      process.exit(1);
    }
  }

  // V3, V4: check locked deps
  if (lockFileJson.version === 3 || lockFileJson.version === 4) {
    let lockedDeps = { ...lockFileJson.deps };
    let resolvedDeps = await resolvePackages();

    for (let name of Object.keys(resolvedDeps)) {
      if (lockedDeps[name] !== resolvedDeps[name]) {
        console.error("Integrity check failed");
        console.error(`Mismatched package ${name}`);
        console.error(`Locked: ${lockedDeps[name]}`);
        console.error(`Actual: ${resolvedDeps[name]}`);
        process.exit(1);
      }
    }
  }

  // V4: count includes both hashes and blobHashes
  let blobHashes =
    lockFileJson.version === 4
      ? lockFileJson.blobHashes
      : ({} as Record<string, string>);
  let totalLockedPackages =
    Object.keys(lockFileJson.hashes).length + Object.keys(blobHashes).length;

  if (totalLockedPackages !== packageIds.length) {
    console.error("Integrity check failed");
    console.error(
      `Mismatched number of resolved packages: ${totalLockedPackages} vs ${packageIds.length}`,
    );
    process.exit(1);
  }

  for (let packageId of packageIds) {
    if (!(packageId in lockFileJson.hashes) && !(packageId in blobHashes)) {
      console.error("Integrity check failed");
      console.error(`Missing package ${packageId} in lock file`);
      process.exit(1);
    }
  }

  // check per-file hashes for legacy packages
  for (let [packageId, hashes] of Object.entries(lockFileJson.hashes)) {
    if (!packageIds.includes(packageId)) {
      console.error("Integrity check failed");
      console.error(
        `Package ${packageId} in lock file but not in resolved packages`,
      );
      process.exit(1);
    }

    for (let [fileId, lockedHash] of Object.entries(hashes)) {
      if (!fileId.startsWith(packageId + "/")) {
        console.error("Integrity check failed");
        console.error(
          `File ${fileId} in lock file does not belong to package ${packageId}`,
        );
        process.exit(1);
      }

      let localHash = getLocalFileHash(fileId);
      if (lockedHash !== localHash) {
        console.error("Integrity check failed");
        console.error(`Mismatched hash for ${fileId}`);
        console.error(`Locked hash: ${lockedHash}`);
        console.error(`Actual hash: ${localHash}`);
        process.exit(1);
      }
    }
  }

  // V4: verify blob hashes against the registry
  if (Object.keys(blobHashes).length > 0) {
    let actor = await mainActor();
    for (let [packageId, lockedBlobHash] of Object.entries(blobHashes)) {
      if (!packageIds.includes(packageId)) {
        console.error("Integrity check failed");
        console.error(
          `Package ${packageId} in lock file but not in resolved packages`,
        );
        process.exit(1);
      }

      let [name, version] = packageId.split("@");
      if (name && version) {
        let result = await actor.getBlobHash(name, version);
        if (result.length === 0 || !result[0]) {
          console.error("Integrity check failed");
          console.error(
            `Package ${packageId} has blob hash in lock file but not in registry`,
          );
          process.exit(1);
        }
        if (result[0] !== lockedBlobHash) {
          console.error("Integrity check failed");
          console.error(`Mismatched blob hash for ${packageId}`);
          console.error(`Locked hash: ${lockedBlobHash}`);
          console.error(`Registry hash: ${result[0]}`);
          process.exit(1);
        }
      }
    }
  }
}
