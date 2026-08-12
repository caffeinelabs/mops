import { afterEach, describe, expect, jest, test } from "@jest/globals";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// `api/actors` pulls in the generated `*.did.js` declarations, which the ESM
// `.js` -> extensionless moduleNameMapper resolves to the raw `.did` files.
jest.unstable_mockModule("../api/actors.js", () => ({
  mainActor: jest.fn(),
  mainOnewayCall: jest.fn(),
  storageActor: jest.fn(),
}));

// `mops.ts` derives `globalCacheDir` at import time.
const cacheHome = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), "mops-cache-clean-")),
);
process.env["XDG_CACHE_HOME"] = cacheHome;

const { assertGlobalCacheDir, cleanCache, show } = await import("../cache.js");

const posixCache = "/home/u/.cache/mops";
const macCache = "/Users/u/Library/Caches/mops";
// `path.join` yields backslashes on Windows, which the old `endsWith("mops/cache")`
// guard could never match — `mops cache clean` threw there unconditionally.
const winCache = "C:\\Users\\u\\AppData\\Local\\mops\\cache";

describe("assertGlobalCacheDir", () => {
  afterEach(() => {
    delete process.env["MOPS_NETWORK"];
  });

  test("accepts the cache dir on every platform layout", () => {
    expect(() => assertGlobalCacheDir(posixCache, posixCache)).not.toThrow();
    expect(() => assertGlobalCacheDir(macCache, macCache)).not.toThrow();
    expect(() => assertGlobalCacheDir(winCache, winCache)).not.toThrow();
  });

  test("accepts the network-scoped cache dir", () => {
    process.env["MOPS_NETWORK"] = "local";
    expect(() =>
      assertGlobalCacheDir(posixCache + "/local", posixCache),
    ).not.toThrow();
    expect(() =>
      assertGlobalCacheDir(winCache + "\\local", winCache),
    ).not.toThrow();
  });

  test("rejects a network segment that is not the current network", () => {
    expect(() =>
      assertGlobalCacheDir(posixCache + "/local", posixCache),
    ).toThrow(/Invalid cache directory/);
  });

  test("rejects anything but the cache root", () => {
    expect(() =>
      assertGlobalCacheDir(posixCache + "/packages", posixCache),
    ).toThrow(/Invalid cache directory/);
    expect(() => assertGlobalCacheDir("/home/u/.cache", posixCache)).toThrow(
      /Invalid cache directory/,
    );
    expect(() => assertGlobalCacheDir("/tmp/something", posixCache)).toThrow(
      /Invalid cache directory/,
    );
  });

  test("rejects a traversing network name", () => {
    process.env["MOPS_NETWORK"] = "../..";
    expect(() =>
      assertGlobalCacheDir(path.join(posixCache, "../.."), posixCache),
    ).toThrow(/Invalid cache directory/);
  });
});

describe("cleanCache", () => {
  const seed = () => {
    let globalCache = show();
    fs.mkdirSync(path.join(globalCache, "packages", "core@1.0.0"), {
      recursive: true,
    });

    let project = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "mops-project-")),
    );
    fs.writeFileSync(path.join(project, "mops.toml"), "[dependencies]\n");
    fs.mkdirSync(path.join(project, ".mops", "core@1.0.0"), {
      recursive: true,
    });
    return { globalCache, project };
  };

  const inProject = async (project: string, fn: () => Promise<void>) => {
    let cwd = process.cwd();
    process.chdir(project);
    try {
      await fn();
    } finally {
      process.chdir(cwd);
    }
  };

  test("removes the global cache and the project's .mops", async () => {
    let { globalCache, project } = seed();
    await inProject(project, () => cleanCache());
    expect(fs.existsSync(globalCache)).toBe(false);
    expect(fs.existsSync(path.join(project, ".mops"))).toBe(false);
  });

  test("global keeps the project's .mops", async () => {
    let { globalCache, project } = seed();
    await inProject(project, () => cleanCache({ global: true }));
    expect(fs.existsSync(globalCache)).toBe(false);
    expect(fs.existsSync(path.join(project, ".mops", "core@1.0.0"))).toBe(true);
  });
});
