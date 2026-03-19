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

type LockFile = LockFileV1 | LockFileV2 | LockFileV3;

export async function checkIntegrity(lock?: "check" | "update" | "ignore") {
  let force = !!lock;

  if (
    !lock &&
    !process.env["CI"] &&
    fs.existsSync(path.join(getRootDir(), "mops.lock"))
  ) {
    lock = "update";
  }

  if (!lock) {
    lock = process.env["CI"] ? "check" : "ignore";
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
  return bytesToHex(sha256(fs.readFileSync(getRootDir() + "/mops.toml")));
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
    return JSON.parse(fs.readFileSync(lockFile).toString()) as LockFile;
  }
  return null;
}

// check if lock file exists and integrity of mopsTomlDepsHash
export function checkLockFileLight(): boolean {
  let existingLockFileJson = readLockFile();
  if (existingLockFileJson) {
    let mopsTomlDepsHash = getMopsTomlDepsHash();
    if (
      existingLockFileJson.version === 3 &&
      mopsTomlDepsHash === existingLockFileJson.mopsTomlDepsHash
    ) {
      return true;
    }
  }
  return false;
}

export async function updateLockFile() {
  // if lock file exists and mops.toml hasn't changed, don't update it
  if (checkLockFileLight()) {
    return;
  }

  let resolvedDeps = await resolvePackages();

  let fileHashes = await getFileHashesFromRegistry();

  let lockFileJson: LockFileV3 = {
    version: 3,
    mopsTomlDepsHash: getMopsTomlDepsHash(),
    deps: resolvedDeps,
    hashes: fileHashes.reduce(
      (acc, [packageId, fileHashes]) => {
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
  };

  let rootDir = getRootDir();
  let lockFile = path.join(rootDir, "mops.lock");
  fs.writeFileSync(lockFile, JSON.stringify(lockFileJson, null, 2));
}

// compare hashes of local files with hashes from the lock file
export async function checkLockFile(force = false) {
  let supportedVersions = [1, 2, 3];
  let rootDir = getRootDir();
  let lockFile = path.join(rootDir, "mops.lock");

  // check if lock file exists
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

  // check lock file version
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

  // V2, V3: check mops.toml deps hash
  if (lockFileJson.version === 2 || lockFileJson.version === 3) {
    if (lockFileJson.mopsTomlDepsHash !== getMopsTomlDepsHash()) {
      console.error("Integrity check failed");
      console.error("Mismatched mops.toml dependencies hash");
      console.error(`Locked hash: ${lockFileJson.mopsTomlDepsHash}`);
      console.error(`Actual hash: ${getMopsTomlDepsHash()}`);
      process.exit(1);
    }
  }

  // V3: check locked deps (including GitHub and local packages)
  if (lockFileJson.version === 3) {
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

  // check number of packages
  if (Object.keys(lockFileJson.hashes).length !== packageIds.length) {
    console.error("Integrity check failed");
    console.error(
      `Mismatched number of resolved packages: ${JSON.stringify(Object.keys(lockFileJson.hashes).length)} vs ${JSON.stringify(packageIds.length)}`,
    );
    process.exit(1);
  }

  // check if resolved packages are in the lock file
  for (let packageId of packageIds) {
    if (!(packageId in lockFileJson.hashes)) {
      console.error("Integrity check failed");
      console.error(`Missing package ${packageId} in lock file`);
      process.exit(1);
    }
  }

  for (let [packageId, hashes] of Object.entries(lockFileJson.hashes)) {
    // check if package is in resolved packages
    if (!packageIds.includes(packageId)) {
      console.error("Integrity check failed");
      console.error(
        `Package ${packageId} in lock file but not in resolved packages`,
      );
      process.exit(1);
    }

    for (let [fileId, lockedHash] of Object.entries(hashes)) {
      // check if file belongs to package
      if (!fileId.startsWith(packageId)) {
        console.error("Integrity check failed");
        console.error(
          `File ${fileId} in lock file does not belong to package ${packageId}`,
        );
        process.exit(1);
      }

      // local file hash vs hash from lock file
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
}
