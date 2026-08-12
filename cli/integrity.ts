import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { getDependencyType, getRootDir, readConfig } from "./mops.js";
import { mainActor } from "./api/actors.js";
import { getEndpoint, getNetwork } from "./api/network.js";
import { resolveDepsAndGraph } from "./resolve-packages.js";
import { getPackageId } from "./helpers/get-package-id.js";
import { normalizeLocalDepPath } from "./helpers/normalize-local-path.js";
import { Dependency } from "./types.js";

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
  // the `[dependencies]` of every local `path` dependency, transitively, keyed
  // by directory — so editing one, or pointing `{MOPS_ENV}` at another, makes
  // the lock stale; omitted when the project declares no path dependency, which
  // is what keeps locks written before this field valid
  localDepsHash?: string;
  hashes: Record<string, Record<string, string>>;
  deps: Record<string, string>;
  // declared dependency edges per registry package version (losers included),
  // so a stale lock can be regenerated without those versions on disk;
  // optional: locks written by older CLIs don't have it
  graph?: Record<string, Record<string, string>>;
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

  // Absent is the valid state for a project with no local path deps, and for
  // locks written by a CLI that predates the field.
  if (
    candidate["version"] === CURRENT_LOCK_VERSION &&
    candidate["localDepsHash"] !== undefined &&
    typeof candidate["localDepsHash"] !== "string"
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

// Declared dependency edges from the lock, even a stale one. The graph is an
// optimization — resolution falls back to cached manifests (fetching missing
// ones) without it — so a pre-graph or malformed `graph` yields {} rather
// than an error.
export function readLockFileGraph(): Record<string, Record<string, string>> {
  let lock = readLockFile();
  if (lock?.version !== CURRENT_LOCK_VERSION || !lock.graph) {
    return {};
  }
  let graph = lock.graph;
  if (
    typeof graph !== "object" ||
    Array.isArray(graph) ||
    !Object.values(graph).every((edges) =>
      isRecordOf(edges, (value) => value.length > 0),
    )
  ) {
    return {};
  }
  return graph;
}

// Why a lock cannot be used as-is. Everything here is decided offline, from the
// lock plus mops.toml — no `.mops/` reads and no network.
type LockDefect =
  | { kind: "missing" }
  | { kind: "unparseable" }
  | { kind: "unsupported-version"; version: number }
  | { kind: "legacy-version"; version: number }
  | { kind: "deps-hash"; locked: string; actual: string }
  | { kind: "local-deps-hash" }
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

  // The root deps hash covers the declared `path` string, not what is behind it,
  // so without this a local dep gaining a dependency of its own — or a
  // `{MOPS_ENV}` path pointing somewhere else — leaves the lock looking fresh
  // and the new dependency never gets installed.
  if (lock.localDepsHash !== getLocalDepsHash()) {
    return { kind: "local-deps-hash" };
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

type MemoEntry = Record<string, string>;

// Published versions are immutable, so a package's file hashes can never change
// once published — that is what makes reusing a fetched answer safe. In-process
// only, never persisted, and keyed by registry endpoint so two networks (or an
// overridden canister id) cannot collide.
const fileHashesMemo = new Map<string, MemoEntry>();

function memoKey(packageId: string): string {
  let { host, canisterId } = getEndpoint(getNetwork());
  return `${host}|${canisterId}|${packageId}`;
}

function toHashRecord(
  fileHashes: Array<[string, Uint8Array | number[]]>,
): Record<string, string> {
  return Object.fromEntries(
    fileHashes.map(([fileId, hash]) => [
      fileId,
      bytesToHex(new Uint8Array(hash)),
    ]),
  );
}

// The registry's file hashes, always via `getFileHashesByPackageIds` — an
// update call, so every answer has been through consensus. There is no query
// variant of this on purpose: a query reply is signed by a single node, and
// nothing that decides whether bytes may be trusted is settled by one node.
async function fetchRegistryFileHashes(
  packageIds: string[],
): Promise<Record<string, Record<string, string>>> {
  let hashes: Record<string, Record<string, string>> = {};
  let missing: string[] = [];
  for (let packageId of packageIds) {
    let memoized = fileHashesMemo.get(memoKey(packageId));
    if (memoized) {
      hashes[packageId] = memoized;
    } else if (!missing.includes(packageId)) {
      missing.push(packageId);
    }
  }
  if (missing.length === 0) {
    return hashes;
  }

  let actor = await mainActor();
  let fileHashesByPackageIds = await actor.getFileHashesByPackageIds(missing);

  for (let [packageId, fileHashes] of fileHashesByPackageIds) {
    let record = toHashRecord(fileHashes);
    fileHashesMemo.set(memoKey(packageId), record);
    hashes[packageId] = record;
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

function sortedDepValues(
  deps: Record<string, Dependency>,
): Record<string, string> {
  return Object.keys(deps)
    .sort()
    .reduce(
      (acc, key) => {
        acc[key] =
          deps[key]?.version || deps[key]?.repo || deps[key]?.path || "";
        return acc;
      },
      {} as Record<string, string>,
    );
}

function getRootDeclaredDeps(): Record<string, Dependency> {
  let config = readConfig();
  return {
    ...(config.dependencies || {}),
    ...(config["dev-dependencies"] || {}),
  };
}

function getMopsTomlDepsHash(): string {
  return bytesToHex(
    sha256(JSON.stringify(sortedDepValues(getRootDeclaredDeps()))),
  );
}

function expandMopsEnv(value: string): string {
  return value.replaceAll("{MOPS_ENV}", process.env.MOPS_ENV || "local");
}

// `[dependencies]` of every local `path` dependency reachable from the root,
// keyed by the dep's root-relative directory. Only `[dependencies]`: a nested
// manifest's dev-dependencies take no part in resolution.
//
// `null` marks a directory with no mops.toml, so creating one changes the
// signature. `{MOPS_ENV}` is expanded into the key, which is what makes the
// signature environment-specific for the projects that use the placeholder.
type LocalDepSignature = Record<string, Record<string, string> | string | null>;

function collectLocalDepManifests(
  rootDir: string,
  deps: Record<string, Dependency>,
  configDir: string,
  visited: Set<string>,
  signature: LocalDepSignature,
) {
  for (let dep of Object.values(deps)) {
    if (!dep.path) {
      continue;
    }
    let dir = expandMopsEnv(path.resolve(configDir, dep.path));
    // path deps chain, and can point back at each other
    if (visited.has(dir)) {
      continue;
    }
    visited.add(dir);

    let key = normalizeLocalDepPath(rootDir, dir);
    let mopsToml = path.join(dir, "mops.toml");
    if (!fs.existsSync(mopsToml)) {
      signature[key] = null;
      continue;
    }
    let nestedDeps: Record<string, Dependency>;
    try {
      nestedDeps = readConfig(mopsToml).dependencies || {};
    } catch {
      // resolution fails on this manifest too; recorded so that fixing it counts
      signature[key] = "unreadable";
      continue;
    }
    signature[key] = sortedDepValues(nestedDeps);
    collectLocalDepManifests(rootDir, nestedDeps, dir, visited, signature);
  }
}

// Undefined when the project declares no local path dependency — that absence
// is what keeps every lock written before this field from being judged stale.
function getLocalDepsHash(): string | undefined {
  let signature: LocalDepSignature = {};
  let rootDir = getRootDir();
  collectLocalDepManifests(
    rootDir,
    getRootDeclaredDeps(),
    rootDir,
    new Set(),
    signature,
  );
  let keys = Object.keys(signature).sort();
  if (!keys.length) {
    return undefined;
  }
  return bytesToHex(
    sha256(JSON.stringify(keys.map((key) => [key, signature[key]]))),
  );
}

// The lock `mops install` would write right now, from a full re-walk of the
// dependency graph. The walk reads each registry version's dependency list
// from the old lock's `graph` first, then the cache, then the registry, so it
// is safe regardless of what a lock-driven install left on disk. Validation
// (below) still never re-walks — not for safety anymore, but because it must
// stay offline and cheap.
async function computeLockFile(): Promise<LockFileV3> {
  // skipLock: re-resolve from mops.toml so abs→relative local paths migrate.
  let { deps: resolvedDeps, graph } = await resolveDepsAndGraph({
    skipLock: true,
  });

  let packageIds = mopsPackageIds(resolvedDeps);

  // Hashes of packages already in the lock are carried over: published
  // versions are immutable, so their file hashes never change. A lock with
  // corrupt hash values is recovered by deleting it (RESTORE_HINT), which
  // leaves nothing to carry and forces a full registry refetch.
  let hashes: Record<string, Record<string, string>> = {};
  let oldLock = readLockFile();
  if (oldLock && oldLock.version === CURRENT_LOCK_VERSION) {
    for (let packageId of packageIds) {
      let carried = oldLock.hashes[packageId];
      if (carried) {
        hashes[packageId] = carried;
      }
    }
  }
  // Anything downloaded this process was already verified against these same
  // hashes, so the memo answers for it and this costs nothing.
  let missingIds = packageIds.filter((packageId) => !hashes[packageId]);
  Object.assign(hashes, await fetchRegistryFileHashes(missingIds));

  return {
    version: CURRENT_LOCK_VERSION,
    mopsTomlDepsHash: getMopsTomlDepsHash(),
    localDepsHash: getLocalDepsHash(),
    deps: resolvedDeps,
    graph,
    hashes,
  };
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
  writeLockFileAtomic(lockFile, JSON.stringify(lockFileJson, null, 2));
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
    case "local-deps-hash":
      return [
        "mops.lock does not match the local `path` dependencies, but --locked was passed.",
        "  A path dependency's mops.toml has changed, or MOPS_ENV differs from the one mops.lock was generated with.",
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
// anything. Local `path` deps are skipped here — resolution normalizes and
// env-expands them, so they are covered by `localDepsHash` instead.
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
// walk-free so it stays cheap and independent of cache state — `--locked`
// must not re-resolve in the mode meant to forbid resolution changes.
// What is checked instead:
//
//   1. every dependency declared in mops.toml is pinned to that same value
//   2. the `deps` and `hashes` maps agree on the set of registry packages
//   3. every file hash in `hashes` matches the registry
//
// Together with the `mopsTomlDepsHash` / `localDepsHash` checks this catches the
// realistic drift (an edited mops.toml, an edited local dependency's manifest, a
// hand-edited or stale lock) plus lock tampering. Published versions are
// immutable, so a transitive version cannot change underneath a lock. Not
// caught: the *file contents* of a local `path` dependency, which is a live
// directory by design and carries no hashes.
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
  // Two sources, both consensus-derived, and one of them is consulted at the
  // moment of admission — so bytes never enter the cache on the word of a
  // single node, whatever the command's lock policy. The lock is preferred
  // because it is already on disk: a committed lock makes this free.
  let locked = readLockFile()?.hashes[packageId];
  let fromLock = !!locked && Object.keys(locked).length > 0;
  let registryHashes = fromLock
    ? (locked as Record<string, string>)
    : ((await fetchRegistryFileHashes([packageId]))[packageId] ?? {});

  // The registry derives its hash list from the same file-id set it serves for
  // download, and collapses a partially-hashed package to an empty list, so
  // this is all-or-nothing: either every file is checkable or none is. Old
  // packages predating recorded hashes fall in the latter bucket.
  if (Object.keys(registryHashes).length === 0) {
    return { errors: [], unverified: true };
  }

  let errors: string[] = [];
  let prefix = packageId + "/";
  let expected = new Map<string, string>();
  for (let [fileId, hash] of Object.entries(registryHashes)) {
    if (!fileId.startsWith(prefix)) {
      errors.push(`File ${fileId} does not belong to package ${packageId}`);
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
    let bytes = data instanceof Uint8Array ? data : Uint8Array.from(data);
    let actualHash = bytesToHex(sha256(bytes));
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

  // Which record was wrong matters for recovery, and only the caller of a
  // failed download can act on it.
  if (errors.length && fromLock) {
    errors.push(
      "These hashes come from mops.lock, so either the download is corrupt or mops.lock is.",
      RESTORE_HINT,
    );
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

  if (
    lock.version === CURRENT_LOCK_VERSION &&
    lock.localDepsHash !== getLocalDepsHash()
  ) {
    errors.push(
      "A local `path` dependency's mops.toml has changed since mops.lock was generated, or MOPS_ENV differs.",
      "  Run `mops install` to update mops.lock, then commit it.",
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
