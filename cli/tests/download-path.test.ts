import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import fs from "node:fs";
import os from "node:os";
import nodePath from "node:path";

// The registry actor and dependency resolution are the only things these tests
// fake; everything else is the real code path. Mocked before importing the
// modules under test, as ESM requires.
type HashEntry = [string, Uint8Array];

let batchCalls: string[][] = [];
let batchFailure: Error | undefined;
const hashResponses = new Map<string, HashEntry[]>();
let resolvedDeps: Record<string, string> = {};

const actor = {
  // Nothing may reach for the query variant: a single node's word is not
  // enough to admit bytes, which is the whole point of the design.
  getFileHashesQuery: async () => {
    throw new Error("getFileHashesQuery must not be used to verify downloads");
  },
  getFileHashesByPackageIds: async (packageIds: string[]) => {
    batchCalls.push(packageIds);
    if (batchFailure) {
      let err = batchFailure;
      batchFailure = undefined;
      throw err;
    }
    // `getFileHashesByPackageIds` answers every id it was asked for; an id it
    // does not know and one that published no hashes both come back with an
    // empty list, neither is omitted (`backend/main/main-canister.mo`).
    return packageIds.map(
      (packageId) =>
        [packageId, hashResponses.get(packageId) ?? []] as [
          string,
          HashEntry[],
        ],
    );
  },
};

jest.unstable_mockModule("../api/actors.js", () => ({
  mainActor: async () => actor,
  storageActor: async () => {
    throw new Error("storageActor should not be used in these tests");
  },
}));

jest.unstable_mockModule("../resolve-packages.js", () => ({
  resolveDepsAndGraph: async () => ({ deps: resolvedDeps, graph: {} }),
}));

const { verifyDownloadedPackageFiles, updateLockFile } =
  await import("../integrity.js");
const { downloadFile } = await import("../api/downloadPackageFiles.js");

const bytes = (text: string) => new TextEncoder().encode(text);
const hashOf = (text: string) => bytesToHex(sha256(bytes(text)));

// Each test uses its own package id: the hash memo is per-process and has no
// reset hook by design, so isolation comes from distinct keys.
let counter = 0;
const uniqueId = () => `pkg${counter++}@1.0.0`;

// The lock is found by walking up from cwd, so a temp project is the only way
// to exercise the real `readLockFile` path.
async function inTempProject<T>(
  {
    lock,
    deps = {},
  }: { lock?: unknown; deps?: Record<string, { version: string }> },
  fn: (dir: string) => Promise<T>,
): Promise<T> {
  let dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), "mops-integrity-"));
  let dependencies = Object.entries(deps)
    .map(([name, dep]) => `${name} = "${dep.version}"`)
    .join("\n");
  fs.writeFileSync(
    nodePath.join(dir, "mops.toml"),
    `[package]\nname = "t"\nversion = "0.1.0"\n\n[dependencies]\n${dependencies}\n`,
  );
  if (lock) {
    fs.writeFileSync(
      nodePath.join(dir, "mops.lock"),
      JSON.stringify(lock, null, 2),
    );
  }
  let cwd = process.cwd();
  process.chdir(dir);
  try {
    return await fn(dir);
  } finally {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const lockWith = (packageId: string, hashes: Record<string, string>) => ({
  version: 3,
  mopsTomlDepsHash: "stale",
  deps: { [packageId.split("@")[0] as string]: "1.0.0" },
  hashes: { [packageId]: hashes },
});

// Only the call logs reset between tests: the hash memo is per-process and has
// no reset hook by design, so isolation comes from unique package ids and the
// registry keeps answering for every id it has already served.
beforeEach(() => {
  batchCalls = [];
  batchFailure = undefined;
  resolvedDeps = {};
});

// Minimal stand-in for the storage canister actor.
function fakeStorage({
  chunks,
  path = "src/lib.mo",
  chunkCount,
  metaErr,
  onCall,
}: {
  chunks: string[];
  path?: string;
  chunkCount?: bigint;
  metaErr?: string;
  onCall?: (method: string) => void;
}) {
  let calls: string[] = [];
  let storage = {
    getFileMeta: async (fileId: string) => {
      calls.push("getFileMeta");
      onCall?.("getFileMeta");
      if (metaErr) {
        return { err: metaErr };
      }
      return {
        ok: {
          id: fileId,
          owners: [],
          path,
          chunkCount: chunkCount ?? BigInt(chunks.length),
        },
      };
    },
    downloadChunk: async (fileId: string, index: bigint) => {
      calls.push(`downloadChunk:${index}`);
      onCall?.(`downloadChunk:${index}`);
      let chunk = chunks[Number(index)];
      if (chunk === undefined) {
        return { err: `Invalid chunk index '${index}' for file '${fileId}'` };
      }
      return { ok: Array.from(bytes(chunk)) };
    },
  };
  return { storage, calls };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asStorage = (storage: unknown) => storage as any;

describe("downloadFile", () => {
  test("fetches meta and chunk 0 concurrently for a single-chunk file", async () => {
    // getFileMeta cannot resolve until downloadChunk has been called, so this
    // deadlocks if the two calls are chained instead of issued together.
    let chunkRequested: () => void;
    let chunkRequestedPromise = new Promise<void>((resolve) => {
      chunkRequested = resolve;
    });
    let { storage, calls } = fakeStorage({
      chunks: ["module {}"],
      onCall: (method) => {
        if (method === "downloadChunk:0") {
          chunkRequested();
        }
      },
    });
    let getFileMeta = storage.getFileMeta;
    storage.getFileMeta = async (fileId: string) => {
      await chunkRequestedPromise;
      return getFileMeta(fileId);
    };

    let { path, data } = await downloadFile(
      asStorage(storage),
      "core@1/lib.mo",
    );

    expect(calls).toEqual(["downloadChunk:0", "getFileMeta"]);
    expect(path).toBe("src/lib.mo");
    expect(data).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(data)).toBe("module {}");
  });

  test("concatenates multiple chunks in order", async () => {
    let { storage, calls } = fakeStorage({ chunks: ["aaa", "bbb", "ccc"] });

    let { data } = await downloadFile(asStorage(storage), "core@1/lib.mo");

    expect(new TextDecoder().decode(data)).toBe("aaabbbccc");
    expect(calls).toEqual([
      "getFileMeta",
      "downloadChunk:0",
      "downloadChunk:1",
      "downloadChunk:2",
    ]);
  });

  test("an empty file has no chunks and the speculative chunk error is ignored", async () => {
    let { storage } = fakeStorage({ chunks: [], chunkCount: 0n });

    let { data } = await downloadFile(asStorage(storage), "core@1/empty.mo");

    expect(data).toEqual(new Uint8Array());
  });

  test("a missing file reports the meta error, not the chunk error", async () => {
    let { storage } = fakeStorage({
      chunks: [],
      metaErr: "File 'core@1/nope.mo' not found",
    });

    await expect(
      downloadFile(asStorage(storage), "core@1/nope.mo"),
    ).rejects.toBe("File 'core@1/nope.mo' not found");
  });

  test("a rejecting meta call does not leave the chunk rejection unhandled", async () => {
    let unhandled: unknown[] = [];
    let onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);

    let storage = {
      getFileMeta: async () => {
        throw new Error("fetch failed");
      },
      downloadChunk: async () => {
        throw new Error("fetch failed");
      },
    };

    try {
      await expect(
        downloadFile(asStorage(storage), "core@1/lib.mo"),
      ).rejects.toThrow("fetch failed");
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  test("a chunk error past chunk 0 aborts the download", async () => {
    let storage = {
      getFileMeta: async () => ({
        ok: { id: "f", owners: [], path: "lib.mo", chunkCount: 3n },
      }),
      downloadChunk: async (_fileId: string, index: bigint) =>
        index === 0n ? { ok: [1, 2, 3] } : { err: "chunk gone" },
    };

    await expect(
      downloadFile(asStorage(storage), "core@1/lib.mo"),
    ).rejects.toBe("chunk gone");
  });
});

describe("verifyDownloadedPackageFiles", () => {
  test("verifies against consensus hashes when the lock cannot answer", async () => {
    let packageId = uniqueId();
    hashResponses.set(packageId, [
      [`${packageId}/src/lib.mo`, sha256(bytes("module {}"))],
    ]);

    let result = await verifyDownloadedPackageFiles(
      packageId,
      new Map([["src/lib.mo", bytes("module {}")]]),
    );

    expect(result).toEqual({ errors: [], unverified: false });
    expect(batchCalls).toEqual([[packageId]]);
  });

  test("forged bytes are refused before anything is staged", async () => {
    let packageId = uniqueId();
    hashResponses.set(packageId, [
      [`${packageId}/src/lib.mo`, sha256(bytes("module {}"))],
    ]);

    let result = await verifyDownloadedPackageFiles(
      packageId,
      new Map([["src/lib.mo", bytes("module { let evil = 1 }")]]),
    );

    expect(result.unverified).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/Hash mismatch for .*src\/lib\.mo/);
    expect(result.errors[0]).toContain(hashOf("module {}"));
  });

  test("a missing file is an error", async () => {
    let packageId = uniqueId();
    hashResponses.set(packageId, [
      [`${packageId}/src/lib.mo`, sha256(bytes("module {}"))],
      [`${packageId}/mops.toml`, sha256(bytes("[package]"))],
    ]);

    let result = await verifyDownloadedPackageFiles(
      packageId,
      new Map([["src/lib.mo", bytes("module {}")]]),
    );

    expect(result.errors).toEqual([
      `Missing file ${packageId}/mops.toml in downloaded package`,
    ]);
  });

  test("an unexpected extra file is an error", async () => {
    let packageId = uniqueId();
    hashResponses.set(packageId, [
      [`${packageId}/src/lib.mo`, sha256(bytes("module {}"))],
    ]);

    let result = await verifyDownloadedPackageFiles(
      packageId,
      new Map([
        ["src/lib.mo", bytes("module {}")],
        ["src/backdoor.mo", bytes("module {}")],
      ]),
    );

    expect(result.errors).toEqual([
      `Unexpected file src/backdoor.mo is not published in ${packageId}`,
    ]);
  });

  test("a file id from another package is an error", async () => {
    let packageId = uniqueId();
    hashResponses.set(packageId, [
      ["other@1.0.0/src/lib.mo", sha256(bytes("module {}"))],
    ]);

    let result = await verifyDownloadedPackageFiles(
      packageId,
      new Map([["src/lib.mo", bytes("module {}")]]),
    );

    expect(result.unverified).toBe(false);
    expect(result.errors).toContain(
      `File other@1.0.0/src/lib.mo does not belong to package ${packageId}`,
    );
  });

  test("a package the registry has no hashes for is admitted, loudly", async () => {
    let packageId = uniqueId();
    hashResponses.set(packageId, []);

    let result = await verifyDownloadedPackageFiles(
      packageId,
      new Map([["src/lib.mo", bytes("module {}")]]),
    );

    // `unverified` is what makes installMopsDep warn; nothing was checkable
    expect(result).toEqual({ errors: [], unverified: true });
    expect(batchCalls).toEqual([[packageId]]);
  });

  test("hashes are fetched once per package per process", async () => {
    let packageId = uniqueId();
    hashResponses.set(packageId, [
      [`${packageId}/src/lib.mo`, sha256(bytes("module {}"))],
    ]);
    let filesData = new Map([["src/lib.mo", bytes("module {}")]]);

    await verifyDownloadedPackageFiles(packageId, filesData);
    await verifyDownloadedPackageFiles(packageId, filesData);

    expect(batchCalls).toEqual([[packageId]]);

    // the memo must not turn a later mismatch into a pass
    let mismatch = await verifyDownloadedPackageFiles(
      packageId,
      new Map([["src/lib.mo", bytes("module { let evil = 1 }")]]),
    );
    expect(mismatch.errors).toHaveLength(1);
  });
});

// One consensus round costs the same however many ids it carries, so the
// callers asking within the same tick — the packages verifying concurrently
// during an install, and the set `installAll` prefetches — must share a single
// `getFileHashesByPackageIds` call.
describe("batched hash fetches", () => {
  const okFiles = () => new Map([["src/lib.mo", bytes("module {}")]]);

  test("concurrent verifications coalesce into one registry call", async () => {
    let packageIds = [uniqueId(), uniqueId(), uniqueId()];
    for (let packageId of packageIds) {
      hashResponses.set(packageId, [
        [`${packageId}/src/lib.mo`, sha256(bytes("module {}"))],
      ]);
    }

    let results = await Promise.all(
      packageIds.map((packageId) =>
        verifyDownloadedPackageFiles(packageId, okFiles()),
      ),
    );

    expect(results).toEqual(
      packageIds.map(() => ({ errors: [], unverified: false })),
    );
    expect(batchCalls).toEqual([packageIds]);
  });

  // The registry answers a package it has no hashes for, with an empty list, so
  // that answer is memoized like any other — which is sound because a published
  // version is immutable and cannot acquire hashes mid-process.
  test("a package with no registry hashes is answered once and memoized", async () => {
    let packageId = uniqueId();

    let first = await verifyDownloadedPackageFiles(packageId, okFiles());
    let second = await verifyDownloadedPackageFiles(packageId, okFiles());

    expect(first).toEqual({ errors: [], unverified: true });
    expect(second).toEqual({ errors: [], unverified: true });
    expect(batchCalls).toEqual([[packageId]]);
  });

  test("a batch larger than the chunk size is split across calls", async () => {
    let packageIds = Array.from({ length: 120 }, () => uniqueId());
    for (let packageId of packageIds) {
      hashResponses.set(packageId, [
        [`${packageId}/src/lib.mo`, sha256(bytes("module {}"))],
      ]);
    }

    let results = await Promise.all(
      packageIds.map((packageId) =>
        verifyDownloadedPackageFiles(packageId, okFiles()),
      ),
    );

    expect(results).toEqual(
      packageIds.map(() => ({ errors: [], unverified: false })),
    );
    // an IC message is capped at 2MB and the reply carries every file hash of
    // every requested package, so no single call may grow with the graph
    expect(batchCalls.map((call) => call.length)).toEqual([50, 50, 20]);
    expect(batchCalls.flat()).toEqual(packageIds);
  });

  test("one failed chunk leaves the other chunks' waiters answered", async () => {
    let packageIds = Array.from({ length: 60 }, () => uniqueId());
    for (let packageId of packageIds) {
      hashResponses.set(packageId, [
        [`${packageId}/src/lib.mo`, sha256(bytes("module {}"))],
      ]);
    }
    // consumed by whichever chunk reaches the actor first
    batchFailure = new Error("fetch failed");

    let settled = await Promise.allSettled(
      packageIds.map((packageId) =>
        verifyDownloadedPackageFiles(packageId, okFiles()),
      ),
    );

    let failedIds = new Set(batchCalls[0]);
    expect(failedIds.size).toBe(50);
    for (let [index, outcome] of settled.entries()) {
      let packageId = packageIds[index] as string;
      expect(outcome.status).toBe(
        failedIds.has(packageId) ? "rejected" : "fulfilled",
      );
    }
  });

  test("a failed call rejects every waiter and a retry fetches fresh", async () => {
    let packageIds = [uniqueId(), uniqueId()];
    for (let packageId of packageIds) {
      hashResponses.set(packageId, [
        [`${packageId}/src/lib.mo`, sha256(bytes("module {}"))],
      ]);
    }
    batchFailure = new Error("fetch failed");

    let settled = await Promise.allSettled(
      packageIds.map((packageId) =>
        verifyDownloadedPackageFiles(packageId, okFiles()),
      ),
    );
    for (let outcome of settled) {
      expect(outcome.status).toBe("rejected");
      expect((outcome as PromiseRejectedResult).reason.message).toBe(
        "fetch failed",
      );
    }

    // nothing lingers from the failure: the retry gets a fresh batched call
    let retried = await Promise.all(
      packageIds.map((packageId) =>
        verifyDownloadedPackageFiles(packageId, okFiles()),
      ),
    );
    expect(retried).toEqual(
      packageIds.map(() => ({ errors: [], unverified: false })),
    );
    expect(batchCalls).toEqual([packageIds, packageIds]);
  });
});

// The lock is consensus-derived and already on disk, so where it covers a
// package it answers for free — and it answers regardless of lock policy, which
// is what makes `mops sources` (lock: "skip") safe.
describe("mops.lock as the trust anchor", () => {
  test("the lock answers first, with no network call at all", async () => {
    let packageId = `locked${counter++}@1.0.0`;
    let fileId = `${packageId}/src/lib.mo`;

    let result = await inTempProject(
      { lock: lockWith(packageId, { [fileId]: hashOf("module {}") }) },
      () =>
        verifyDownloadedPackageFiles(
          packageId,
          new Map([["src/lib.mo", bytes("module {}")]]),
        ),
    );

    expect(result).toEqual({ errors: [], unverified: false });
    expect(batchCalls).toEqual([]);
  });

  test("bytes that do not match the lock fail the download, naming the lock", async () => {
    let packageId = `locked${counter++}@1.0.0`;
    let fileId = `${packageId}/src/lib.mo`;

    let result = await inTempProject(
      { lock: lockWith(packageId, { [fileId]: hashOf("module {}") }) },
      () =>
        verifyDownloadedPackageFiles(
          packageId,
          new Map([["src/lib.mo", bytes("module { let evil = 1 }")]]),
        ),
    );

    expect(batchCalls).toEqual([]);
    expect(result.errors[0]).toMatch(/Hash mismatch/);
    // a plain hash mismatch would send the user to retry the download; this
    // one has to point at mops.lock as the other possible culprit
    expect(result.errors.join("\n")).toMatch(
      /These hashes come from mops\.lock/,
    );
    expect(result.errors.join("\n")).toMatch(/Restore mops\.lock/);
  });

  test("a lock entry recording no hashes falls through to consensus", async () => {
    let packageId = `lockempty${counter++}@1.0.0`;
    let fileId = `${packageId}/src/lib.mo`;
    // written when the package genuinely had no hashes; the registry has them now
    hashResponses.set(packageId, [[fileId, sha256(bytes("module {}"))]]);

    let result = await inTempProject({ lock: lockWith(packageId, {}) }, () =>
      verifyDownloadedPackageFiles(
        packageId,
        new Map([["src/lib.mo", bytes("module { let evil = 1 }")]]),
      ),
    );

    expect(batchCalls).toEqual([[packageId]]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/Hash mismatch/);
  });
});

// The lock is generated from consensus hashes, and anything downloaded this
// process was verified against those same hashes — so regeneration is free.
describe("lockfile generation", () => {
  const runUpdateLockFile = async (packageId: string) => {
    let name = packageId.split("@")[0] as string;
    resolvedDeps = { [name]: "1.0.0" };
    let thrown: unknown;
    await inTempProject(
      { deps: { [name]: { version: "1.0.0" } } },
      async () => {
        try {
          await updateLockFile({ silent: true });
        } catch (err) {
          thrown = err;
        }
      },
    );
    return { thrown };
  };

  test("reuses the hashes the download already fetched", async () => {
    let packageId = `relock${counter++}@1.0.0`;
    hashResponses.set(packageId, [
      [`${packageId}/src/lib.mo`, sha256(bytes("module {}"))],
    ]);

    let download = await verifyDownloadedPackageFiles(
      packageId,
      new Map([["src/lib.mo", bytes("module {}")]]),
    );
    expect(download).toEqual({ errors: [], unverified: false });
    expect(batchCalls).toEqual([[packageId]]);

    let { thrown } = await runUpdateLockFile(packageId);

    expect(thrown).toBeUndefined();
    // still one call in total: the memo answered lock generation
    expect(batchCalls).toEqual([[packageId]]);
  });

  test("fetches hashes for a package that was not downloaded", async () => {
    let packageId = `fresh${counter++}@1.0.0`;
    hashResponses.set(packageId, [
      [`${packageId}/src/lib.mo`, sha256(bytes("module {}"))],
    ]);

    let { thrown } = await runUpdateLockFile(packageId);

    expect(thrown).toBeUndefined();
    expect(batchCalls).toEqual([[packageId]]);
  });
});
