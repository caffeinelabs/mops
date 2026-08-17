import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import fs from "node:fs";
import os from "node:os";
import nodePath from "node:path";

// Exercises `installAll`'s hash prefetch with everything around it faked:
// the registry actor, resolution, and the install/cache steps themselves.
// What stays real is integrity.ts and installAll's own control flow.
let batchCalls: string[][] = [];
const hashResponses = new Map<string, Array<[string, Uint8Array]>>();
let resolvedDeps: Record<string, string> = {};
// how many registry calls had happened by the time the downloads ran —
// a prefetch that overlaps them shows up here, one that trails them does not
let batchCallsWhenInstallDepsRan = -1;

const actor = {
  getFileHashesQuery: async () => {
    throw new Error("getFileHashesQuery must not be used to verify downloads");
  },
  getFileHashesByPackageIds: async (packageIds: string[]) => {
    batchCalls.push(packageIds);
    return packageIds.flatMap((packageId) => {
      let entry = hashResponses.get(packageId);
      return entry === undefined
        ? []
        : [[packageId, entry] as [string, Array<[string, Uint8Array]>]];
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

jest.unstable_mockModule("../commands/install/install-deps.js", () => ({
  installDeps: async () => {
    // stand in for download time: long enough for a pending flush to fire
    await new Promise((resolve) => setTimeout(resolve, 20));
    batchCallsWhenInstallDepsRan = batchCalls.length;
    return true;
  },
}));

jest.unstable_mockModule("../commands/install/sync-local-cache.js", () => ({
  syncLocalCache: async () => ({}),
}));

jest.unstable_mockModule("../notify-installs.js", () => ({
  notifyInstalls: async () => {},
}));

jest.unstable_mockModule("../check-requirements.js", () => ({
  checkRequirements: async () => {},
}));

const { installAll } = await import("../commands/install/install-all.js");

const bytes = (text: string) => new TextEncoder().encode(text);
const hashOf = (text: string) => bytesToHex(sha256(bytes(text)));

// The hash memo is per-process with no reset hook, so isolation comes from
// unique package names, same as download-path.test.ts.
let counter = 0;

beforeEach(() => {
  batchCalls = [];
  resolvedDeps = {};
  batchCallsWhenInstallDepsRan = -1;
});

async function inTempProject<T>(
  { name, lock }: { name: string; lock?: unknown },
  fn: (dir: string) => Promise<T>,
): Promise<T> {
  let dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), "mops-prefetch-"));
  fs.writeFileSync(
    nodePath.join(dir, "mops.toml"),
    `[package]\nname = "t"\nversion = "0.1.0"\n\n[dependencies]\n${name} = "1.0.0"\n`,
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

describe("hash prefetch in installAll", () => {
  test("without a usable lock, hashes are fetched while downloads run and never twice", async () => {
    let name = `prefetch${counter++}`;
    let packageId = `${name}@1.0.0`;
    resolvedDeps = { [name]: "1.0.0" };
    hashResponses.set(packageId, [
      [`${packageId}/src/lib.mo`, sha256(bytes("module {}"))],
    ]);

    let ok = await inTempProject({ name }, async (dir) => {
      let ok = await installAll({ silent: true });
      // the memo warmed by the prefetch answered lock generation for free
      let written = JSON.parse(
        fs.readFileSync(nodePath.join(dir, "mops.lock"), "utf8"),
      );
      expect(written.hashes[packageId]).toEqual({
        [`${packageId}/src/lib.mo`]: hashOf("module {}"),
      });
      return ok;
    });

    expect(ok).toBe(true);
    expect(batchCalls).toEqual([[packageId]]);
    expect(batchCallsWhenInstallDepsRan).toBe(1);
  });

  test("the from-lock path makes no registry hash call at all", async () => {
    let name = `locked${counter++}`;
    let packageId = `${name}@1.0.0`;
    let lock = {
      version: 3,
      mopsTomlDepsHash: bytesToHex(sha256(JSON.stringify({ [name]: "1.0.0" }))),
      deps: { [name]: "1.0.0" },
      hashes: {
        [packageId]: { [`${packageId}/src/lib.mo`]: hashOf("module {}") },
      },
    };
    // an accidental prefetch would be visible: this id is not memoized
    hashResponses.set(packageId, [
      [`${packageId}/src/lib.mo`, sha256(bytes("module {}"))],
    ]);

    let ok = await inTempProject({ name, lock }, () =>
      installAll({ silent: true }),
    );

    expect(ok).toBe(true);
    expect(batchCallsWhenInstallDepsRan).toBe(0);
    expect(batchCalls).toEqual([]);
  });
});
