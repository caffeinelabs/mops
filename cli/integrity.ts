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

function isRecordOf(
  value: unknown,
  isValid: (entry: string) => boolean,
): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (entry) => typeof entry === "string" && isValid(entry),
    )
  );
}

// Valid JSON is not enough: every reader below indexes into `deps` / `hashes`,
// so a lock that parses but has the wrong shape must be reported as unparseable
// rather than crashing deep in a caller. Unknown future versions are left alone
// so they get the clearer "unsupported version" message.
function hasValidShape(lock: unknown): boolean {
  if (!lock || typeof lock !== "object" || Array.isArray(lock)) {
    return false;
  }
  let candidate = lock as Record<string, unknown>;
  if (typeof candidate["version"] !== "number") {
    return false;
  }
  if (!SUPPORTED_LOCK_VERSIONS.includes(candidate["version"] as number)) {
    return true;
  }

  let hashes = candidate["hashes"];
  if (!hashes || typeof hashes !== "object" || Array.isArray(hashes)) {
    return false;
  }
  for (let files of Object.values(hashes)) {
    if (!isRecordOf(files, (hash) => hash.length > 0)) {
      return false;
    }
  }

  let hashField =
    candidate["version"] === 1 ? "mopsTomlHash" : "mopsTomlDepsHash";
  if (typeof candidate[hashField] !== "string") {
    return false;
  }

  // Empty dep values are meaningless and would throw in getDependencyType.
  if (
    candidate["version"] === CURRENT_LOCK_VERSION &&
    !isRecordOf(candidate["deps"], (value) => value.length > 0)
  ) {
    return false;
  }

  return true;
}

function readLockFileState(): LockFileState {
  let lockFile = getLockFilePath();
  if (!fs.existsSync(lockFile)) {
    return { status: "missing" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(lockFile).toString());
  } catch {
    return { status: "unparseable" };
  }
  if (!hasValidShape(parsed)) {
    return { status: "unparseable" };
  }
  return { status: "ok", lock: parsed as LockFile };
}

// Lenient reader: a missing or unreadable lock is simply "no usable lock".
// `mops install` regenerates it; `--locked` reports it via `readLockFileState`.
export function readLockFile(): LockFile | null {
  let state = readLockFileState();
  return state.status === "ok" ? state.lock : null;
}

// Why a lock cannot be used as-is. Everything here is decided offline, from the
// lock plus mops.toml — no `.mops/` reads and no network.
type LockDefect =
  | { kind: "missing" }
  | { kind: "unparseable" }
  | { kind: "unsupported-version"; version: number }
  | { kind: "legacy-version"; version: number }
  | { kind: "deps-hash"; locked: string; actual: string }
  | { kind: "absolute-paths" }
  | { kind: "deps-mismatch"; problems: string[] }
  | { kind: "hashes-deps-mismatch"; detail: string };

// The single source of truth for "is this lock usable". `checkLockFileLight`
// (which decides whether we install from the lock) and
// `checkLockedPrerequisites` (which decides whether `--locked` passes) both
// derive from this, so they cannot drift apart. They must not: if `--locked`
// accepted a lock that the light check rejects, `installAll` would fall back to
// re-resolving mops.toml — a resolution change in the mode meant to forbid one.
function inspectLockFile(): LockDefect | null {
  let state = readLockFileState();
  if (state.status === "missing") {
    return { kind: "missing" };
  }
  if (state.status === "unparseable") {
    return { kind: "unparseable" };
  }

  let lock = state.lock;
  if (!SUPPORTED_LOCK_VERSIONS.includes(lock.version)) {
    return { kind: "unsupported-version", version: lock.version };
  }
  if (lock.version !== CURRENT_LOCK_VERSION) {
    return { kind: "legacy-version", version: lock.version };
  }

  let actual = getMopsTomlDepsHash();
  if (lock.mopsTomlDepsHash !== actual) {
    return { kind: "deps-hash", locked: lock.mopsTomlDepsHash, actual };
  }

  // Locks written before local paths became root-relative store machine-specific
  // absolute paths. Treating such a lock as stale makes plain `mops install`
  // migrate it (this used to need an explicit `--lock update`).
  let absolute = Object.values(lock.deps).some(
    (value) => getDependencyType(value) === "local" && path.isAbsolute(value),
  );
  if (absolute) {
    return { kind: "absolute-paths" };
  }

  // The deps hash covers mops.toml, not the lock, so a hand-edited `deps` entry
  // would otherwise pass and get installed — plain `mops install` would silently
  // install the wrong version. Treating it as stale makes install re-resolve.
  let depProblems = checkLockedDeps(lock);
  if (depProblems.length) {
    return { kind: "deps-mismatch", problems: depProblems };
  }

  // Structural agreement between the two maps. Free, and it means a `hashes`
  // section with packages added or removed by hand self-heals. Individual hash
  // *values* are not checked here: that needs the registry, which is an update
  // call (~1.2s), and those values are consumed only by `--locked` and
  // `mops verify`, never by the build.
  let packageIds = mopsPackageIds(lock.deps);
  for (let packageId of packageIds) {
    if (!(packageId in lock.hashes)) {
      return {
        kind: "hashes-deps-mismatch",
        detail: `package ${packageId} has no file hashes`,
      };
    }
  }
  for (let packageId of Object.keys(lock.hashes)) {
    if (!packageIds.includes(packageId)) {
      return {
        kind: "hashes-deps-mismatch",
        detail: `package ${packageId} has file hashes but is not a locked dependency`,
      };
    }
  }

  return null;
}

// True when the lock exists, is current-format, and matches mops.toml's deps.
// This is the cheap check every command runs: no `.mops/` reads, no network.
export function checkLockFileLight(): boolean {
  return inspectLockFile() === null;
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

// Use only for defects that a plain `mops install` actually repairs — i.e. the
// ones `inspectLockFile` reports, which is exactly what makes the lock stale
// enough for `updateLockFile` to rewrite it.
const REGENERATE_HINT =
  "Run `mops install` (without --locked) to update mops.lock, then commit it.";

// For defects a plain `mops install` will NOT repair. A lock whose recorded file
// hashes are wrong still satisfies every staleness check, so `updateLockFile`
// leaves it alone — telling the user to run `mops install` would send them in a
// loop. Deleting the lock, or restoring the committed one, is what works.
const RESTORE_HINT =
  "Restore mops.lock from version control, or delete it and run `mops install` to regenerate it.";

// How each offline defect is reported under `--locked`. Split from the failure
// itself so every defect `inspectLockFile` can return is visibly accounted for,
// and so the hint matches what actually recovers.
function describeLockDefect(defect: LockDefect): string[] {
  switch (defect.kind) {
    case "missing":
      return [
        "mops.lock is missing, but --locked was passed.",
        "Run `mops install` to generate it, then commit mops.lock.",
      ];
    case "unparseable":
      return [
        "mops.lock could not be parsed, but --locked was passed.",
        RESTORE_HINT,
      ];
    case "unsupported-version":
      return [
        `mops.lock has unsupported version ${defect.version} (supported: ${SUPPORTED_LOCK_VERSIONS.join(", ")}).`,
        "Update the mops CLI, or run `mops install` (without --locked) to regenerate it.",
      ];
    case "legacy-version":
      return [
        `mops.lock is version ${defect.version}, but the current format is ${CURRENT_LOCK_VERSION}, and --locked was passed.`,
        REGENERATE_HINT,
      ];
    case "deps-hash":
      return [
        "mops.toml has changed since mops.lock was generated, but --locked was passed.",
        `  Locked dependencies hash: ${defect.locked}`,
        `  Actual dependencies hash: ${defect.actual}`,
        REGENERATE_HINT,
      ];
    case "absolute-paths":
      return [
        "mops.lock records machine-specific absolute paths for local dependencies, but --locked was passed.",
        REGENERATE_HINT,
      ];
    case "deps-mismatch":
      return [
        "mops.lock does not match mops.toml, but --locked was passed.",
        ...defect.problems.map((problem) => `  ${problem}`),
        REGENERATE_HINT,
      ];
    case "hashes-deps-mismatch":
      return [
        "mops.lock is internally inconsistent, but --locked was passed.",
        `  ${defect.detail}`,
        REGENERATE_HINT,
      ];
  }
}

// Cheap, offline part of `--locked`. Derived from `inspectLockFile` so it fails
// on exactly what `checkLockFileLight` rejects. Runs before anything is
// downloaded, so `mops test --locked` in a repo with no lock fails immediately.
export function checkLockedPrerequisites(): void {
  let defect = inspectLockFile();
  if (defect) {
    failLocked(describeLockDefect(defect));
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
    if (!lockedFiles) {
      // Already reported above; do not report the same package twice.
      continue;
    }
    if (!registryFiles) {
      problems.push(
        `package ${packageId}: the registry reports no file hashes for it`,
      );
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
    // Everything a plain install repairs was already caught by the
    // prerequisites, so reaching here means the recorded file hashes disagree
    // with the registry — which install will not rewrite. Give the hint that
    // actually recovers, not the one that loops.
    failLocked([
      "mops.lock does not match the registry, but --locked was passed.",
      ...problems.map((problem) => `  ${problem}`),
      RESTORE_HINT,
    ]);
  }
}

// Verify freshly downloaded package files against the hashes published in the
// registry, before they are committed to the global cache.
export type DownloadVerification = {
  errors: string[];
  // True when the registry published no hashes to check against, so these bytes
  // enter the cache unverified. Surfaced to the user rather than passed off as
  // verified.
  unverified: boolean;
};

export async function verifyDownloadedPackageFiles(
  packageId: string,
  filesData: Map<string, ArrayLike<number>>,
): Promise<DownloadVerification> {
  let registryHashes = (await fetchRegistryFileHashes([packageId]))[packageId];

  // The registry derives its hash list from the same file-id set it serves for
  // download, and collapses a partially-hashed package to an empty list, so
  // this is all-or-nothing: either every file is checkable or none is. Old
  // packages predating recorded hashes fall in the latter bucket.
  if (!registryHashes || Object.keys(registryHashes).length === 0) {
    return { errors: [], unverified: true };
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

  return { errors, unverified: false };
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
        "Run `mops install` to regenerate it, or restore mops.lock from version control.",
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
        RESTORE_HINT,
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
