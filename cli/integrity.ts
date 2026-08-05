import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { getDependencyType, getRootDir, readConfig } from "./mops.js";
import { mainActor } from "./api/actors.js";
import { resolvePackages } from "./resolve-packages.js";
import { getPackageId } from "./helpers/get-package-id.js";

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

const CURRENT_LOCK_VERSION = 3;
const SUPPORTED_LOCK_VERSIONS = [1, 2, 3];

// How a command treats `mops.lock`:
//   "maintain" — the dev flow. Keep the lock in sync, self-heal a broken one.
//   "locked"   — the CI flow (`--locked`). Fail if the lock is missing or would
//                change; never write it.
//   "skip"     — internal only (`mops sources`): install from the lock, but do
//                not validate, write, or print anything.
export type LockPolicy = "maintain" | "locked" | "skip";

type LockFileState =
  | { status: "missing" }
  | { status: "unparseable" }
  | { status: "ok"; lock: LockFile };

export async function checkIntegrity(
  lock: LockPolicy = "maintain",
  { silent = false }: { silent?: boolean } = {},
) {
  if (lock === "skip") {
    return;
  }
  if (lock === "locked") {
    await assertLockedUpToDate();
  } else {
    await updateLockFile({ silent });
  }
}

function getLockFilePath(): string {
  return path.join(getRootDir(), "mops.lock");
}

function readLockFileState(): LockFileState {
  let lockFile = getLockFilePath();
  if (!fs.existsSync(lockFile)) {
    return { status: "missing" };
  }
  try {
    return {
      status: "ok",
      lock: JSON.parse(fs.readFileSync(lockFile).toString()) as LockFile,
    };
  } catch {
    return { status: "unparseable" };
  }
}

// Lenient reader: a missing or unreadable lock is simply "no usable lock".
// `mops install` regenerates it; `--locked` reports it via `readLockFileState`.
export function readLockFile(): LockFile | null {
  let state = readLockFileState();
  return state.status === "ok" ? state.lock : null;
}

// True when the lock exists, is current-format, and matches mops.toml's deps.
// This is the cheap check every command runs: no `.mops/` reads, no network.
export function checkLockFileLight(): boolean {
  let lock = readLockFile();
  return (
    !!lock &&
    lock.version === CURRENT_LOCK_VERSION &&
    lock.mopsTomlDepsHash === getMopsTomlDepsHash() &&
    !hasAbsoluteLocalDeps(lock)
  );
}

// Locks written before local paths became root-relative store machine-specific
// absolute paths. Treating such a lock as stale makes plain `mops install`
// migrate it automatically (this used to need an explicit `--lock update`).
function hasAbsoluteLocalDeps(lock: LockFile): boolean {
  if (lock.version !== CURRENT_LOCK_VERSION) {
    return false;
  }
  return Object.values(lock.deps).some(
    (value) => getDependencyType(value) === "local" && path.isAbsolute(value),
  );
}

async function fetchRegistryFileHashes(
  packageIds: string[],
): Promise<Record<string, Record<string, string>>> {
  if (packageIds.length === 0) {
    return {};
  }
  let actor = await mainActor();
  let fileHashesByPackageIds =
    await actor.getFileHashesByPackageIds(packageIds);

  let hashes: Record<string, Record<string, string>> = {};
  for (let [packageId, fileHashes] of fileHashesByPackageIds) {
    hashes[packageId] = Object.fromEntries(
      fileHashes.map(([fileId, hash]) => [
        fileId,
        bytesToHex(new Uint8Array(hash)),
      ]),
    );
  }
  return hashes;
}

// Registry packages only — github/path deps have no published file hashes.
// Aliases like `base@0` and `base@0.16` collapse to the same packageId.
function mopsPackageIds(deps: Record<string, string>): string[] {
  return [
    ...new Set(
      Object.entries(deps)
        .filter(([, version]) => getDependencyType(version) === "mops")
        .map(([name, version]) => getPackageId(name, version)),
    ),
  ];
}

// get hash of local file from '.mops' dir by fileId
export function getLocalFileHash(fileId: string): string | null {
  let file = path.join(getRootDir(), ".mops", fileId);
  if (!fs.existsSync(file)) {
    return null;
  }
  return bytesToHex(sha256(fs.readFileSync(file)));
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

// The lock `mops install` would write right now, from a full re-walk of the
// dependency graph. Only safe to call when the lock is *not* already valid:
// a lock-driven install deliberately skips the versions that lost a conflict,
// so their manifests are absent from the cache and the walk would throw ENOENT.
// That is why validation (below) never re-walks. See PR notes on GH #679.
async function computeLockFile(): Promise<LockFileV3> {
  // skipLock: re-resolve from mops.toml so abs→relative local paths migrate.
  let resolvedDeps = await resolvePackages({ skipLock: true });
  return {
    version: CURRENT_LOCK_VERSION,
    mopsTomlDepsHash: getMopsTomlDepsHash(),
    deps: resolvedDeps,
    hashes: await fetchRegistryFileHashes(mopsPackageIds(resolvedDeps)),
  };
}

// Regenerate the lock unless the cheap check says it is already current.
// Self-healing by design: a missing, unparseable, legacy-format or
// manifest-inconsistent lock is rewritten rather than treated as an error.
// Returns true if the lock file was (re)written.
export async function updateLockFile({
  silent = false,
}: { silent?: boolean } = {}): Promise<boolean> {
  if (checkLockFileLight()) {
    return false;
  }

  let lockFileJson = await computeLockFile();
  let lockFile = getLockFilePath();
  let isNew = !fs.existsSync(lockFile);
  fs.writeFileSync(lockFile, JSON.stringify(lockFileJson, null, 2));
  if (isNew && !silent) {
    console.log("mops.lock created. Commit this file.");
  }
  return true;
}

function failLocked(lines: string[]): never {
  console.error("Error: " + lines[0]);
  for (let line of lines.slice(1)) {
    console.error(line);
  }
  process.exit(1);
}

const REGENERATE_HINT =
  "Run `mops install` (without --locked) to update mops.lock, then commit it.";

// Cheap, offline part of `--locked`: the lock must exist, parse, be the current
// format, and match mops.toml. Runs before anything is downloaded so
// `mops test --locked` in a repo with no lock fails immediately.
export function checkLockedPrerequisites(): void {
  let state = readLockFileState();

  if (state.status === "missing") {
    failLocked([
      "mops.lock is missing, but --locked was passed.",
      "Run `mops install` to generate it, then commit mops.lock.",
    ]);
  }

  if (state.status === "unparseable") {
    failLocked([
      "mops.lock could not be parsed, but --locked was passed.",
      "Restore mops.lock from version control, or run `mops install` (without --locked) to regenerate it.",
    ]);
  }

  let lock = state.lock;

  if (!SUPPORTED_LOCK_VERSIONS.includes(lock.version)) {
    failLocked([
      `mops.lock has unsupported version ${lock.version} (supported: ${SUPPORTED_LOCK_VERSIONS.join(", ")}).`,
      "Update the mops CLI, or run `mops install` (without --locked) to regenerate it.",
    ]);
  }

  if (lock.version !== CURRENT_LOCK_VERSION) {
    failLocked([
      `mops.lock is version ${lock.version}, but the current format is ${CURRENT_LOCK_VERSION}, and --locked was passed.`,
      REGENERATE_HINT,
    ]);
  }

  let mopsTomlDepsHash = getMopsTomlDepsHash();
  if (lock.mopsTomlDepsHash !== mopsTomlDepsHash) {
    failLocked([
      "mops.toml has changed since mops.lock was generated, but --locked was passed.",
      `  Locked dependencies hash: ${lock.mopsTomlDepsHash}`,
      `  Actual dependencies hash: ${mopsTomlDepsHash}`,
      REGENERATE_HINT,
    ]);
  }

  let depProblems = checkLockedDeps(lock);
  if (depProblems.length) {
    failLocked([
      "mops.lock does not match mops.toml, but --locked was passed.",
      ...depProblems.map((problem) => `  ${problem}`),
      REGENERATE_HINT,
    ]);
  }
}

// Every dependency declared in mops.toml must be pinned to that same value in
// the lock. Pure and offline, so `--locked` can run it before downloading
// anything. Local `path` deps are skipped: resolution normalizes them and they
// point at live directories by design.
function checkLockedDeps(lock: LockFileV3): string[] {
  let problems: string[] = [];
  let config = readConfig();
  let declared = {
    ...(config.dependencies || {}),
    ...(config["dev-dependencies"] || {}),
  };
  for (let [name, dep] of Object.entries(declared)) {
    if (dep.path) {
      continue;
    }
    let expected = dep.repo || dep.version;
    let locked = lock.deps[name];
    if (locked !== expected) {
      problems.push(
        `dependency ${name}: mops.toml declares ${expected}, mops.lock has ${locked ?? "no entry"}`,
      );
    }
  }
  return problems;
}

// Validate a lock without re-walking the dependency graph. Deliberately
// walk-free: on a lock-driven install the versions that lost a version conflict
// are never downloaded, so `resolvePackages({skipLock: true})` cannot run — it
// would throw ENOENT on a loser's missing manifest. What is checked instead:
//
//   1. every dependency declared in mops.toml is pinned to that same value
//   2. the `deps` and `hashes` maps agree on the set of registry packages
//   3. every file hash in `hashes` matches the registry
//
// Together with the `mopsTomlDepsHash` check this catches the realistic drift
// (an edited mops.toml, a hand-edited or stale lock) plus lock tampering.
// Published versions are immutable, so a transitive version cannot change
// underneath a lock. Not caught: transitive drift of local `path` dependencies,
// which are live directories by design and carry no hashes.
async function checkLockConsistency(lock: LockFileV3): Promise<string[]> {
  let problems = checkLockedDeps(lock);

  let packageIds = mopsPackageIds(lock.deps);
  for (let packageId of packageIds) {
    if (!(packageId in lock.hashes)) {
      problems.push(`package ${packageId}: no file hashes in mops.lock`);
    }
  }
  for (let packageId of Object.keys(lock.hashes)) {
    if (!packageIds.includes(packageId)) {
      problems.push(
        `package ${packageId}: has file hashes in mops.lock but is not a locked dependency`,
      );
    }
  }

  let registryHashes = await fetchRegistryFileHashes(packageIds);
  for (let packageId of packageIds) {
    let lockedFiles = lock.hashes[packageId];
    let registryFiles = registryHashes[packageId];
    if (!lockedFiles || !registryFiles) {
      continue;
    }
    for (let fileId of new Set([
      ...Object.keys(lockedFiles),
      ...Object.keys(registryFiles),
    ])) {
      let locked = lockedFiles[fileId];
      let actual = registryFiles[fileId];
      if (locked === actual) {
        continue;
      }
      if (locked === undefined) {
        problems.push(`${fileId}: published in the registry but not locked`);
      } else if (actual === undefined) {
        problems.push(`${fileId}: locked but not published in ${packageId}`);
      } else {
        problems.push(`${fileId}: locked ${locked}, registry ${actual}`);
      }
    }
  }

  return problems;
}

// `--locked`: the lock must exist and already agree with mops.toml and the
// registry. Never writes mops.lock.
export async function assertLockedUpToDate(): Promise<void> {
  checkLockedPrerequisites();

  let lock = readLockFile();
  if (!lock || lock.version !== CURRENT_LOCK_VERSION) {
    // checkLockedPrerequisites already exits on these; keeps types honest.
    return;
  }

  let problems = await checkLockConsistency(lock);
  if (problems.length) {
    failLocked([
      "mops.lock is out of date, but --locked was passed.",
      ...problems.map((problem) => `  ${problem}`),
      REGENERATE_HINT,
    ]);
  }
}

// Verify freshly downloaded package files against the hashes published in the
// registry, before they are committed to the global cache. Returns error lines;
// empty means the download is trustworthy.
export async function verifyDownloadedPackageFiles(
  packageId: string,
  filesData: Map<string, ArrayLike<number>>,
): Promise<string[]> {
  let registryHashes = (await fetchRegistryFileHashes([packageId]))[packageId];

  // Packages published before the registry recorded file hashes have none.
  // Nothing to verify against — the lockfile is equally blind to them.
  if (!registryHashes || Object.keys(registryHashes).length === 0) {
    return [];
  }

  let errors: string[] = [];
  let prefix = packageId + "/";
  let expected = new Map<string, string>();
  for (let [fileId, hash] of Object.entries(registryHashes)) {
    if (!fileId.startsWith(prefix)) {
      errors.push(
        `Registry file ${fileId} does not belong to package ${packageId}`,
      );
      continue;
    }
    expected.set(fileId.slice(prefix.length), hash);
  }

  for (let [filePath, data] of filesData) {
    let expectedHash = expected.get(filePath);
    if (expectedHash === undefined) {
      errors.push(
        `Unexpected file ${filePath} is not published in ${packageId}`,
      );
      continue;
    }
    let actualHash = bytesToHex(sha256(Uint8Array.from(data)));
    if (actualHash !== expectedHash) {
      errors.push(
        `Hash mismatch for ${prefix}${filePath}\n  Expected: ${expectedHash}\n  Actual:   ${actualHash}`,
      );
    }
  }

  for (let filePath of expected.keys()) {
    if (!filesData.has(filePath)) {
      errors.push(`Missing file ${prefix}${filePath} in downloaded package`);
    }
  }

  return errors;
}

type VerifyResult = {
  packages: number;
  files: number;
  errors: string[];
};

// Full on-disk audit for `mops verify`: every file the lock records must exist
// under `.mops/` with the locked hash, and the lock itself must still match
// mops.toml and the registry. Returns errors instead of exiting so the caller
// can report them all at once.
export async function verifyIntegrity(): Promise<VerifyResult> {
  let state = readLockFileState();

  if (state.status === "missing") {
    return {
      packages: 0,
      files: 0,
      errors: [
        "mops.lock is missing.",
        "Run `mops install` to generate it, then commit mops.lock.",
      ],
    };
  }

  if (state.status === "unparseable") {
    return {
      packages: 0,
      files: 0,
      errors: [
        "mops.lock could not be parsed.",
        "Restore mops.lock from version control, or run `mops install` to regenerate it.",
      ],
    };
  }

  let lock = state.lock;

  if (!SUPPORTED_LOCK_VERSIONS.includes(lock.version)) {
    return {
      packages: 0,
      files: 0,
      errors: [
        `mops.lock has unsupported version ${lock.version} (supported: ${SUPPORTED_LOCK_VERSIONS.join(", ")}).`,
        "Update the mops CLI, or run `mops install` to regenerate it.",
      ],
    };
  }

  let errors: string[] = [];

  if (lock.version === 1 && lock.mopsTomlHash !== getMopsTomlHash()) {
    errors.push(
      "mops.toml has changed since mops.lock was generated.",
      `  Locked hash: ${lock.mopsTomlHash}`,
      `  Actual hash: ${getMopsTomlHash()}`,
    );
  }

  if (lock.version !== 1 && lock.mopsTomlDepsHash !== getMopsTomlDepsHash()) {
    errors.push(
      "mops.toml has changed since mops.lock was generated.",
      `  Locked dependencies hash: ${lock.mopsTomlDepsHash}`,
      `  Actual dependencies hash: ${getMopsTomlDepsHash()}`,
    );
  }

  // Disk first, so "not installed" is reported ahead of registry mismatches —
  // it is the more actionable diagnosis when both apply.
  let fileCount = 0;
  let missing: string[] = [];
  for (let [packageId, hashes] of Object.entries(lock.hashes)) {
    for (let [fileId, lockedHash] of Object.entries(hashes)) {
      fileCount++;
      if (!fileId.startsWith(packageId + "/")) {
        errors.push(
          `File ${fileId} in mops.lock does not belong to package ${packageId}`,
        );
        continue;
      }
      let localHash = getLocalFileHash(fileId);
      if (localHash === null) {
        missing.push(fileId);
        continue;
      }
      if (localHash !== lockedHash) {
        errors.push(
          `.mops/${fileId} does not match mops.lock`,
          `  Locked hash: ${lockedHash}`,
          `  Actual hash: ${localHash}`,
          `  Delete the \`.mops/${packageId}\` directory and run \`mops install\` to restore it.`,
        );
      }
    }
  }

  if (missing.length) {
    errors.push(
      `${missing.length} locked file(s) are missing from .mops/, starting with ${missing[0]}.`,
      "Run `mops install` first.",
    );
  }

  if (lock.version === CURRENT_LOCK_VERSION) {
    let problems = await checkLockConsistency(lock);
    if (problems.length) {
      errors.push(
        "mops.lock does not match mops.toml and the registry:",
        ...problems.map((problem) => `  ${problem}`),
        "Restore mops.lock from version control, or delete it and run `mops install` to regenerate it.",
      );
    }
  } else {
    errors.push(
      `mops.lock is version ${lock.version}; the current format is ${CURRENT_LOCK_VERSION}.`,
      "Run `mops install` to upgrade it, then commit mops.lock.",
    );
  }

  return {
    packages: Object.keys(lock.hashes).length,
    files: fileCount,
    errors,
  };
}
