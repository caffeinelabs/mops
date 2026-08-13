import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { getDependencyType, getRootDir, readConfig } from "./mops.js";
import { mainActor } from "./api/actors.js";
import { resolveDepsAndGraph, resolvePackages } from "./resolve-packages.js";
import { getPackageId } from "./helpers/get-package-id.js";
import { warnCiLockAutoDetect } from "./helpers/deprecate-ci-lock.js";

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
  // declared dependency edges per registry package version (losers included),
  // so a stale lock can be regenerated without those versions on disk;
  // optional: locks written by older CLIs don't have it
  graph?: Record<string, Record<string, string>>;
};

type LockFile = LockFileV1 | LockFileV2 | LockFileV3;

type CheckIntegrityOptions = {
  // When `--lock` is omitted, use this instead of the CI-aware default.
  // Mutating commands pass `"update"` so `CI` cannot force check after changing deps.
  defaultLock?: "update";
};

export async function checkIntegrity(
  lock?: "check" | "update" | "ignore",
  { defaultLock }: CheckIntegrityOptions = {},
) {
  // Explicit `--lock` forces regeneration; omitted flag keeps the light skip path.
  let force = !!lock;

  if (!lock) {
    if (defaultLock) {
      lock = defaultLock;
    } else if (process.env["CI"]) {
      warnCiLockAutoDetect();
      lock = "check";
    } else {
      lock = "update";
    }
  }

  if (lock === "update") {
    let regenerated = await updateLockFile({ force });
    await checkLockFile(force, regenerated);
  } else if (lock === "check") {
    await checkLockFile(force);
  }
}

async function getFileHashesFromRegistry(): Promise<
  [string, [string, Uint8Array | number[]][]][]
> {
  return getFileHashesByPackageIds(await getResolvedMopsPackageIds());
}

async function getFileHashesByPackageIds(
  packageIds: string[],
): Promise<[string, [string, Uint8Array | number[]][]][]> {
  if (packageIds.length === 0) {
    return [];
  }
  let actor = await mainActor();
  return actor.getFileHashesByPackageIds(packageIds);
}

async function getResolvedMopsPackageIds(): Promise<string[]> {
  let resolvedPackages = await resolvePackages();
  let packageIds = Object.entries(resolvedPackages)
    .filter(([_, version]) => getDependencyType(version) === "mops")
    .map(([name, version]) => getPackageId(name, version));
  // dedupe: aliases like `base@0`, `base@0.16` collapse to the same packageId
  return [...new Set(packageIds)];
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
        "mops.lock is corrupted. Run `mops install --lock update` to regenerate it.",
      );
      process.exit(1);
    }
  }
  return null;
}

// Parsed v3 lock, tolerating a missing, corrupt or older-version lock
// (unlike readLockFile, which exits on corruption). For optimizations that
// must never block regeneration.
function readLockFileTolerant(): LockFileV3 | null {
  let lockFile = path.join(getRootDir(), "mops.lock");
  try {
    let lock = JSON.parse(fs.readFileSync(lockFile).toString());
    if (lock?.version === 3) {
      return lock as LockFileV3;
    }
  } catch {
    // fall through
  }
  return null;
}

// Declared dependency edges from the lock; empty for pre-graph locks.
export function readLockFileGraph(): Record<string, Record<string, string>> {
  return readLockFileTolerant()?.graph ?? {};
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

// returns true if the lock file was (re)written, false if it was skipped
// because the existing lock is still valid.
export async function updateLockFile({
  force = false,
}: { force?: boolean } = {}): Promise<boolean> {
  // if lock file exists and mops.toml hasn't changed, don't update it
  // (unless forced: `--lock update` must unconditionally regenerate so users
  // can recover from a corrupt lockfile without `rm mops.lock`)
  if (!force && checkLockFileLight()) {
    return false;
  }

  // skipLock: re-resolve from mops.toml so abs→relative local paths migrate.
  let { deps: resolvedDeps, graph } = await resolveDepsAndGraph({
    skipLock: true,
  });

  let packageIds = [
    ...new Set(
      Object.entries(resolvedDeps)
        .filter(([_, version]) => getDependencyType(version) === "mops")
        .map(([name, version]) => getPackageId(name, version)),
    ),
  ];

  // Hashes of packages already in the lock are carried over: published
  // versions are immutable, so their file hashes never change. Explicit
  // `--lock update` refetches everything, so it remains the recovery
  // command for a lock with corrupt hashes.
  let hashes: Record<string, Record<string, string>> = {};
  if (!force) {
    let oldHashes = readLockFileTolerant()?.hashes ?? {};
    for (let packageId of packageIds) {
      let carried = oldHashes[packageId];
      if (carried) {
        hashes[packageId] = carried;
      }
    }
  }

  let missingIds = packageIds.filter((packageId) => !hashes[packageId]);
  let fileHashes = await getFileHashesByPackageIds(missingIds);
  for (let [packageId, packageFileHashes] of fileHashes) {
    hashes[packageId] = Object.fromEntries(
      packageFileHashes.map(([fileId, hash]) => [
        fileId,
        bytesToHex(new Uint8Array(hash)),
      ]),
    );
  }

  let lockFileJson: LockFileV3 = {
    version: 3,
    mopsTomlDepsHash: getMopsTomlDepsHash(),
    deps: resolvedDeps,
    graph,
    hashes,
  };

  let rootDir = getRootDir();
  let lockFile = path.join(rootDir, "mops.lock");
  let isNew = !fs.existsSync(lockFile);
  writeLockFileAtomic(lockFile, JSON.stringify(lockFileJson, null, 2));
  if (isNew) {
    console.log("mops.lock created.");
    console.log("  Applications: commit this file.");
    console.log("  Libraries: add mops.lock to .gitignore.");
  }
  return true;
}

// Stage into a sibling temp file and atomic-rename onto the lock, so a
// concurrent `mops install` never reads a half-written lock.
function writeLockFileAtomic(lockFile: string, content: string) {
  let tmpFile = `${lockFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, content);
  try {
    fs.renameSync(tmpFile, lockFile);
  } catch {
    // Windows can refuse to replace a file another process holds open;
    // fall back to a direct write rather than failing the command
    fs.writeFileSync(lockFile, content);
    fs.rmSync(tmpFile, { force: true });
  }
}

// compare hashes of local files with hashes from the lock file
// `regenerated` indicates the lockfile was just rewritten from the registry
// (via `updateLockFile`), so any remaining hash mismatch must be a local edit.
export async function checkLockFile(force = false, regenerated = false) {
  let supportedVersions = [1, 2, 3];
  let rootDir = getRootDir();
  let lockFile = path.join(rootDir, "mops.lock");

  // check if lock file exists
  if (!fs.existsSync(lockFile)) {
    if (force) {
      console.error(
        "Missing lock file. Run `mops install --lock update` to generate it.",
      );
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
    console.error("Run `mops install --lock update` to regenerate it.");
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
      console.error("Run `mops install --lock update` to regenerate it.");
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
      console.error("Run `mops install --lock update` to regenerate it.");
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
        console.error("Run `mops install --lock update` to regenerate it.");
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
    console.error("Run `mops install --lock update` to regenerate it.");
    process.exit(1);
  }

  // check if resolved packages are in the lock file
  for (let packageId of packageIds) {
    if (!(packageId in lockFileJson.hashes)) {
      console.error("Integrity check failed");
      console.error(`Missing package ${packageId} in lock file`);
      console.error("Run `mops install --lock update` to regenerate it.");
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
      console.error("Run `mops install --lock update` to regenerate it.");
      process.exit(1);
    }

    for (let [fileId, lockedHash] of Object.entries(hashes)) {
      // check if file belongs to package
      if (!fileId.startsWith(packageId + "/")) {
        console.error("Integrity check failed");
        console.error(
          `File ${fileId} in lock file does not belong to package ${packageId}`,
        );
        console.error("Run `mops install --lock update` to regenerate it.");
        process.exit(1);
      }

      // local file hash vs hash from lock file
      let localHash = getLocalFileHash(fileId);
      if (lockedHash !== localHash) {
        console.error("Integrity check failed");
        console.error(`Mismatched hash for ${fileId}`);
        console.error(`Locked hash: ${lockedHash}`);
        console.error(`Actual hash: ${localHash}`);
        console.error("");
        if (regenerated && force) {
          // The lock was just rewritten entirely from the registry, so the
          // only way for a per-file hash to still differ is that
          // .mops/<file> was edited locally. Point users at the actual fix.
          let pkgDir = fileId.split("/")[0];
          console.error(
            `.mops/${fileId} differs from the registry — your local copy has been modified.`,
          );
          console.error(
            `To restore from the global cache, delete the \`.mops/${pkgDir}\` directory and run \`mops install\`.`,
          );
          console.error(
            "To keep custom changes, use a `repo` or `path` entry in mops.toml instead of editing .mops/ directly.",
          );
        } else if (regenerated) {
          // implicit regeneration carries hashes over from the previous
          // lock, so the mismatch can also be a corrupt carried hash
          let pkgDir = fileId.split("/")[0];
          console.error(`.mops/${fileId} does not match the lock.`);
          console.error(
            "If you have not modified files under .mops/, a hash carried over from the previous lock may be corrupt.",
          );
          console.error(
            `Run \`mops install --lock update\` to refresh hashes from the registry, or delete the \`.mops/${pkgDir}\` directory and run \`mops install\` to restore the package.`,
          );
        } else {
          console.error(
            "If you have not modified files under .mops/, your lockfile may be stale or corrupt.",
          );
          console.error("Run `mops install --lock update` to regenerate it.");
        }
        process.exit(1);
      }
    }
  }
}
