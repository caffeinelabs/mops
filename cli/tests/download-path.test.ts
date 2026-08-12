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
type QueryResult = { ok: HashEntry[] } | { err: string };

let queryCalls: Array<[string, string]> = [];
let batchCalls: string[][] = [];
const queryResponses = new Map<string, QueryResult>();
// Only set where a test needs the update call to answer differently from the
// query call; otherwise the two registry methods agree, as they must.
const batchResponses = new Map<string, HashEntry[]>();
let resolvedDeps: Record<string, string> = {};

const actor = {
  getFileHashesQuery: async (name: string, version: string) => {
    queryCalls.push([name, version]);
    return queryResponses.get(`${name}@${version}`) ?? { err: "not found" };
  },
  getFileHashesByPackageIds: async (packageIds: string[]) => {
    batchCalls.push(packageIds);
    return packageIds.map((packageId) => {
      let override = batchResponses.get(packageId);
      if (override) {
        return [packageId, override] as [string, HashEntry[]];
      }
      let res = queryResponses.get(packageId);
      return [packageId, res && "ok" in res ? res.ok : []] as [
        string,
        HashEntry[],
      ];
    });
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

// Only the call logs reset between tests. The registry keeps answering for
// every package id it has already served, because lock generation audits every
// package the process fetched by query — package ids are unique per test, so
// the responses never collide.
beforeEach(() => {
  queryCalls = [];
  batchCalls = [];
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
  test("verifies via the query method, not the batch update call", async () => {
    let packageId = uniqueId();
    queryResponses.set(packageId, {
      ok: [[`${packageId}/src/lib.mo`, sha256(bytes("module {}"))]],
    });

    let result = await verifyDownloadedPackageFiles(
      packageId,
      new Map([["src/lib.mo", bytes("module {}")]]),
    );

    expect(result).toEqual({ errors: [], unverified: false });
    expect(queryCalls).toEqual([packageId.split("@")]);
    expect(batchCalls).toEqual([]);
  });

  test("a mismatched hash is an error", async () => {
    let packageId = uniqueId();
    queryResponses.set(packageId, {
      ok: [[`${packageId}/src/lib.mo`, sha256(bytes("module {}"))]],
    });

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
    queryResponses.set(packageId, {
      ok: [
        [`${packageId}/src/lib.mo`, sha256(bytes("module {}"))],
        [`${packageId}/mops.toml`, sha256(bytes("[package]"))],
      ],
    });

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
    queryResponses.set(packageId, {
      ok: [[`${packageId}/src/lib.mo`, sha256(bytes("module {}"))]],
    });

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

  test("a registry file id from another package is an error", async () => {
    let packageId = uniqueId();
    queryResponses.set(packageId, {
      ok: [["other@1.0.0/src/lib.mo", sha256(bytes("module {}"))]],
    });

    let result = await verifyDownloadedPackageFiles(
      packageId,
      new Map([["src/lib.mo", bytes("module {}")]]),
    );

    expect(result.unverified).toBe(false);
    expect(result.errors).toContain(
      `Registry file other@1.0.0/src/lib.mo does not belong to package ${packageId}`,
    );
  });

  test("an #err reply means unverified, matching the batch method's empty list", async () => {
    let packageId = uniqueId();
    queryResponses.set(packageId, { err: "File hash not found for x" });

    let result = await verifyDownloadedPackageFiles(
      packageId,
      new Map([["src/lib.mo", bytes("module {}")]]),
    );

    expect(result).toEqual({ errors: [], unverified: true });
  });

  test("an empty hash list means unverified", async () => {
    let packageId = uniqueId();
    queryResponses.set(packageId, { ok: [] });

    let result = await verifyDownloadedPackageFiles(
      packageId,
      new Map([["src/lib.mo", bytes("module {}")]]),
    );

    expect(result).toEqual({ errors: [], unverified: true });
  });

  test("a query reply that contradicts mops.lock is refused, not trusted", async () => {
    let packageId = uniqueId();
    let fileId = `${packageId}/src/lib.mo`;
    // the query response matches the bytes on offer, so plain verification
    // would pass; only the lock reveals that they are not what was published
    queryResponses.set(packageId, {
      ok: [[fileId, sha256(bytes("module { let evil = 1 }"))]],
    });

    let result = await inTempProject(
      { lock: lockWith(packageId, { [fileId]: hashOf("module {}") }) },
      () =>
        verifyDownloadedPackageFiles(
          packageId,
          new Map([["src/lib.mo", bytes("module { let evil = 1 }")]]),
        ),
    );

    expect(result.unverified).toBe(false);
    expect(result.errors[0]).toBe(
      `${packageId}: mops.lock and the registry disagree about the published file hashes`,
    );
    expect(result.errors[1]).toBe(
      `  ${fileId}: query ${hashOf("module { let evil = 1 }")}, mops.lock ${hashOf("module {}")}`,
    );
    expect(result.errors.join("\n")).toMatch(/Restore mops\.lock/);
    // reported as a disagreement, not as a corrupted download
    expect(result.errors.join("\n")).not.toMatch(/Hash mismatch/);
  });

  test("a query reply claiming a file mops.lock does not have is refused", async () => {
    let packageId = uniqueId();
    let fileId = `${packageId}/src/lib.mo`;
    let extraId = `${packageId}/src/extra.mo`;
    queryResponses.set(packageId, {
      ok: [
        [fileId, sha256(bytes("module {}"))],
        [extraId, sha256(bytes("module {}"))],
      ],
    });

    let result = await inTempProject(
      { lock: lockWith(packageId, { [fileId]: hashOf("module {}") }) },
      () =>
        verifyDownloadedPackageFiles(
          packageId,
          new Map([
            ["src/lib.mo", bytes("module {}")],
            ["src/extra.mo", bytes("module {}")],
          ]),
        ),
    );

    expect(result.errors[1]).toBe(
      `  ${extraId}: in the query response, absent from mops.lock`,
    );
  });

  test("an empty query reply falls back to mops.lock rather than passing unverified", async () => {
    let packageId = uniqueId();
    let fileId = `${packageId}/src/lib.mo`;
    // the admin hash backfill has not reached this node yet
    queryResponses.set(packageId, { err: "File hash not found for x" });
    let lock = lockWith(packageId, { [fileId]: hashOf("module {}") });

    let good = await inTempProject({ lock }, () =>
      verifyDownloadedPackageFiles(
        packageId,
        new Map([["src/lib.mo", bytes("module {}")]]),
      ),
    );
    expect(good).toEqual({ errors: [], unverified: false });

    let bad = await inTempProject({ lock }, () =>
      verifyDownloadedPackageFiles(
        packageId,
        new Map([["src/lib.mo", bytes("module { let evil = 1 }")]]),
      ),
    );
    expect(bad.errors[0]).toMatch(/Hash mismatch/);
  });

  test("a lock that agrees leaves ordinary verification untouched", async () => {
    let packageId = uniqueId();
    let fileId = `${packageId}/src/lib.mo`;
    queryResponses.set(packageId, {
      ok: [[fileId, sha256(bytes("module {}"))]],
    });
    let lock = lockWith(packageId, { [fileId]: hashOf("module {}") });

    let good = await inTempProject({ lock }, () =>
      verifyDownloadedPackageFiles(
        packageId,
        new Map([["src/lib.mo", bytes("module {}")]]),
      ),
    );
    expect(good).toEqual({ errors: [], unverified: false });

    let bad = await inTempProject({ lock }, () =>
      verifyDownloadedPackageFiles(
        packageId,
        new Map([["src/lib.mo", bytes("module { let evil = 1 }")]]),
      ),
    );
    expect(bad.errors).toHaveLength(1);
    expect(bad.errors[0]).toMatch(/Hash mismatch/);
  });

  test("hashes are fetched once per package per process", async () => {
    let packageId = uniqueId();
    queryResponses.set(packageId, {
      ok: [[`${packageId}/src/lib.mo`, sha256(bytes("module {}"))]],
    });
    let filesData = new Map([["src/lib.mo", bytes("module {}")]]);

    await verifyDownloadedPackageFiles(packageId, filesData);
    await verifyDownloadedPackageFiles(packageId, filesData);

    expect(queryCalls).toHaveLength(1);
    expect(batchCalls).toEqual([]);

    // the memo must not turn a later mismatch into a pass
    let mismatch = await verifyDownloadedPackageFiles(
      packageId,
      new Map([["src/lib.mo", bytes("module { let evil = 1 }")]]),
    );
    expect(mismatch.errors).toHaveLength(1);
  });
});

// `updateLockFile` -> `computeLockFile` is where a package downloaded on the
// strength of a query reply first meets a consensus answer, and there is no
// lock yet to have caught it earlier.
describe("lockfile generation", () => {
  const runUpdateLockFile = async (packageId: string) => {
    let name = packageId.split("@")[0] as string;
    resolvedDeps = { [name]: "1.0.0" };
    let errors: string[] = [];
    let consoleError = jest
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        errors.push(args.join(" "));
      });
    let exit = jest.spyOn(process, "exit").mockImplementation(((
      code?: number,
    ) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
    try {
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
      return { errors, thrown };
    } finally {
      consoleError.mockRestore();
      exit.mockRestore();
    }
  };

  test("writes consensus hashes, not the query hashes it already has", async () => {
    let packageId = `agree${counter++}@1.0.0`;
    let fileId = `${packageId}/src/lib.mo`;
    queryResponses.set(packageId, {
      ok: [[fileId, sha256(bytes("module {}"))]],
    });

    // prime the memo the way a download does
    await verifyDownloadedPackageFiles(
      packageId,
      new Map([["src/lib.mo", bytes("module {}")]]),
    );
    expect(batchCalls).toEqual([]);

    let { thrown } = await runUpdateLockFile(packageId);

    expect(thrown).toBeUndefined();
    // the query memo did not satisfy lock generation
    expect(batchCalls).toHaveLength(1);
    expect(batchCalls[0]).toContain(packageId);
  });

  test("a package downloaded against forged query hashes dies at lock time", async () => {
    let packageId = `forged${counter++}@1.0.0`;
    let fileId = `${packageId}/src/lib.mo`;
    queryResponses.set(packageId, {
      ok: [[fileId, sha256(bytes("module { let evil = 1 }"))]],
    });
    batchResponses.set(packageId, [[fileId, sha256(bytes("module {}"))]]);

    // the forged bytes pass download verification against the forged reply
    let download = await verifyDownloadedPackageFiles(
      packageId,
      new Map([["src/lib.mo", bytes("module { let evil = 1 }")]]),
    );
    expect(download).toEqual({ errors: [], unverified: false });

    let { errors, thrown } = await runUpdateLockFile(packageId);

    expect(thrown).toEqual(new Error("process.exit(1)"));
    expect(errors[0]).toBe(
      `Error: ${packageId}: the registry's query response disagrees with its consensus response`,
    );
    expect(errors[1]).toBe(
      `  ${fileId}: query ${hashOf("module { let evil = 1 }")}, consensus ${hashOf("module {}")}`,
    );
    expect(errors.join("\n")).toMatch(/mops cache clean/);
  });

  test("a query reply claiming hashes the registry does not have dies at lock time", async () => {
    let packageId = `phantom${counter++}@1.0.0`;
    let fileId = `${packageId}/src/lib.mo`;
    queryResponses.set(packageId, {
      ok: [[fileId, sha256(bytes("module {}"))]],
    });
    // consensus says this package has no recorded hashes at all
    batchResponses.set(packageId, []);

    await verifyDownloadedPackageFiles(
      packageId,
      new Map([["src/lib.mo", bytes("module {}")]]),
    );

    let { errors, thrown } = await runUpdateLockFile(packageId);

    expect(thrown).toEqual(new Error("process.exit(1)"));
    expect(errors[1]).toBe(
      `  ${fileId}: in the query response, absent from consensus`,
    );
  });

  test("a downloaded package that never reaches the lock is audited too", async () => {
    // a version that lost a conflict: cached, but absent from the resolved graph
    let loserId = `loser${counter++}@1.0.0`;
    let loserFileId = `${loserId}/src/lib.mo`;
    queryResponses.set(loserId, {
      ok: [[loserFileId, sha256(bytes("module { let evil = 1 }"))]],
    });
    batchResponses.set(loserId, [[loserFileId, sha256(bytes("module {}"))]]);
    await verifyDownloadedPackageFiles(
      loserId,
      new Map([["src/lib.mo", bytes("module { let evil = 1 }")]]),
    );

    let winnerId = `winner${counter++}@1.0.0`;
    queryResponses.set(winnerId, {
      ok: [[`${winnerId}/src/lib.mo`, sha256(bytes("module {}"))]],
    });

    let { errors, thrown } = await runUpdateLockFile(winnerId);

    expect(thrown).toEqual(new Error("process.exit(1)"));
    expect(errors[0]).toContain(loserId);
  });

  test("a query node that has not seen the hash backfill is not a disagreement", async () => {
    let packageId = `lagging${counter++}@1.0.0`;
    let fileId = `${packageId}/src/lib.mo`;
    // `_getFileHashes` returns #err until every file of the package is hashed
    queryResponses.set(packageId, { err: "File hash not found for x" });
    batchResponses.set(packageId, [[fileId, sha256(bytes("module {}"))]]);

    let download = await verifyDownloadedPackageFiles(
      packageId,
      new Map([["src/lib.mo", bytes("module {}")]]),
    );
    expect(download).toEqual({ errors: [], unverified: true });

    let { thrown } = await runUpdateLockFile(packageId);

    expect(thrown).toBeUndefined();
  });
});
