import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const getHighestSemverBatch = jest.fn<(...args: any[]) => Promise<any>>();
const installMopsDep = jest.fn<(...args: any[]) => Promise<boolean>>();
const installFromGithub = jest.fn<(...args: any[]) => Promise<boolean>>();
const syncLocalCache = jest.fn<() => Promise<Record<string, string>>>();
const notifyInstalls = jest.fn<(...args: any[]) => Promise<void>>();
const checkIntegrity = jest.fn<(...args: any[]) => Promise<void>>();
const checkRequirements = jest.fn<(...args: any[]) => Promise<void>>();

// `api/actors` pulls in the generated `*.did.js` declarations, which the ESM
// `.js` -> extensionless moduleNameMapper resolves to the raw `.did` files.
jest.unstable_mockModule("../api/actors.js", () => ({
  mainActor: jest.fn(async () => ({ getHighestSemverBatch })),
  mainOnewayCall: jest.fn(),
  storageActor: jest.fn(),
}));

// The installers and the post-install tail are mocked out; the tests here
// assert what `update` installs, what it writes to mops.toml, and that the
// tail runs exactly once per invocation.
jest.unstable_mockModule("../commands/install/install-mops-dep.js", () => ({
  installMopsDep,
}));
jest.unstable_mockModule("../commands/install/install-from-github.js", () => ({
  installFromGithub,
}));
jest.unstable_mockModule("../commands/install/sync-local-cache.js", () => ({
  syncLocalCache,
}));
jest.unstable_mockModule("../notify-installs.js", () => ({ notifyInstalls }));
jest.unstable_mockModule("../integrity.js", () => ({ checkIntegrity }));
jest.unstable_mockModule("../check-requirements.js", () => ({
  checkRequirements,
}));

const { update } = await import("../commands/update.js");
const { noteTransientNetworkError } =
  await import("../commands/install/install-concurrency.js");

const SHA_OLD = "1111111111111111111111111111111111111111";
const SHA_NEW = "2222222222222222222222222222222222222222";

let originalCwd = process.cwd();
let originalFetch = globalThis.fetch;
let projectRoot = "";
let logs: string[] = [];
let logSpy: ReturnType<typeof jest.spyOn>;
let warnSpy: ReturnType<typeof jest.spyOn>;

const makeProject = (toml: string) => {
  projectRoot = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "mops-update-")),
  );
  fs.writeFileSync(path.join(projectRoot, "mops.toml"), toml);
  process.chdir(projectRoot);
  return projectRoot;
};

const readToml = () =>
  fs.readFileSync(path.join(projectRoot, "mops.toml"), "utf8");

// Stub the GitHub commits API so no test depends on the network or the
// unauthenticated rate limit.
const stubGithub = (sha: string) => {
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ sha }),
  })) as unknown as typeof fetch;
};

const failGithub = (message: string) => {
  globalThis.fetch = jest.fn(async () => {
    throw new Error(message);
  }) as unknown as typeof fetch;
};

const output = () =>
  logs.join("\n").replace(new RegExp(`\\[[0-9;]*m`, "g"), "");

beforeEach(() => {
  logs = [];
  logSpy = jest.spyOn(console, "log").mockImplementation((...args: any[]) => {
    logs.push(args.join(" "));
  });
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  getHighestSemverBatch.mockReset();
  installMopsDep.mockReset();
  installMopsDep.mockResolvedValue(true);
  installFromGithub.mockReset();
  installFromGithub.mockResolvedValue(true);
  syncLocalCache.mockReset();
  syncLocalCache.mockResolvedValue({});
  notifyInstalls.mockReset();
  notifyInstalls.mockResolvedValue(undefined);
  checkIntegrity.mockReset();
  checkIntegrity.mockResolvedValue(undefined);
  checkRequirements.mockReset();
  checkRequirements.mockResolvedValue(undefined);
  process.exitCode = 0;
});

afterEach(() => {
  logSpy.mockRestore();
  warnSpy.mockRestore();
  globalThis.fetch = originalFetch;
  process.chdir(originalCwd);
  process.exitCode = 0;
});

// Same exit-code vocabulary as `mops outdated`, so a CI gate can treat either
// command the same way.
describe("mops update exit codes", () => {
  test("exits 2 for a package that is not a dependency", async () => {
    makeProject('[dependencies]\ncore = "1.0.0"\n');

    await update("nope");

    expect(output()).toMatch('Package "nope" is not installed!');
    expect(getHighestSemverBatch).not.toHaveBeenCalled();
    expect(installMopsDep).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  test("exits 2 when mops.toml is missing", async () => {
    let root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "mops-update-empty-")),
    );
    process.chdir(root);

    await expect(update()).rejects.toMatchObject({
      name: "CliError",
      exitCode: 2,
      message: expect.stringContaining("mops.toml' not found"),
    });
  });

  test("exits 0 when everything is up to date", async () => {
    makeProject('[dependencies]\ncore = "1.0.0"\n');
    getHighestSemverBatch.mockResolvedValue({ ok: [["core", "1.0.0"]] });

    await update();

    expect(output()).toMatch("All dependencies are up to date!");
    expect(installMopsDep).not.toHaveBeenCalled();
    expect(syncLocalCache).not.toHaveBeenCalled();
    expect(checkIntegrity).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(0);
  });

  test("exits 0 after applying an update", async () => {
    makeProject('[dependencies]\ncore = "1.0.0"\n');
    getHighestSemverBatch.mockResolvedValue({ ok: [["core", "1.2.0"]] });

    await update();

    expect(installMopsDep).toHaveBeenCalledWith(
      "core",
      "1.2.0",
      expect.objectContaining({ threads: expect.any(Number) }),
    );
    expect(readToml()).toMatch('core = "1.2.0"');
    expect(output()).toMatch("Updated core 1.0.0 -> 1.2.0");
    expect(process.exitCode).toBe(0);
  });

  test("writes a dev-dependency back to [dev-dependencies]", async () => {
    makeProject('[dev-dependencies]\ntest = "1.0.0"\n');
    getHighestSemverBatch.mockResolvedValue({ ok: [["test", "1.1.0"]] });

    await update();

    expect(readToml()).toMatch(/\[dev-dependencies\]\ntest = "1\.1\.0"/);
    expect(process.exitCode).toBe(0);
  });

  test("keeps the pinned alias as the mops.toml key", async () => {
    makeProject('[dependencies]\n"core@1" = "1.0.0"\n');
    getHighestSemverBatch.mockResolvedValue({ ok: [["core", "1.5.0"]] });

    await update();

    expect(installMopsDep).toHaveBeenCalledWith(
      "core",
      "1.5.0",
      expect.objectContaining({ threads: expect.any(Number) }),
    );
    expect(readToml()).toMatch('"core@1" = "1.5.0"');
  });
});

// `update` and `outdated` share `getAvailableGithubUpdates`, so they cannot
// drift apart on what "outdated" means for a `repo = "..."` dependency.
describe("mops update github dependencies", () => {
  const githubToml = (sha: string) =>
    `[dependencies]\nmydep = "https://github.com/org/repo#main@${sha}"\n`;

  test("re-pins a dep whose branch head moved", async () => {
    makeProject(githubToml(SHA_OLD));
    stubGithub(SHA_NEW);

    await update();

    expect(installFromGithub).toHaveBeenCalledWith(
      "mydep",
      `https://github.com/org/repo#main@${SHA_NEW}`,
      expect.anything(),
    );
    expect(readToml()).toMatch(
      `mydep = "https://github.com/org/repo#main@${SHA_NEW}"`,
    );
    expect(process.exitCode).toBe(0);
  });

  test("does not touch a dep already pinned to the branch head", async () => {
    makeProject(githubToml(SHA_OLD));
    stubGithub(SHA_OLD);

    await update();

    expect(installFromGithub).not.toHaveBeenCalled();
    expect(readToml()).toMatch(SHA_OLD);
  });

  test("re-pins a github dev-dependency into [dev-dependencies]", async () => {
    makeProject(
      `[dev-dependencies]\nmydep = "https://github.com/org/repo#main@${SHA_OLD}"\n`,
    );
    stubGithub(SHA_NEW);

    await update();

    expect(readToml()).toMatch(
      new RegExp(
        `\\[dev-dependencies\\]\\nmydep = "https://github.com/org/repo#main@${SHA_NEW}"`,
      ),
    );
  });

  test("updates only the requested github dep", async () => {
    makeProject(
      `[dependencies]\nmydep = "https://github.com/org/repo#main@${SHA_OLD}"\nother = "https://github.com/org/other#main@${SHA_OLD}"\n`,
    );
    stubGithub(SHA_NEW);

    await update("mydep");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(installFromGithub).toHaveBeenCalledTimes(1);
    expect(installFromGithub).toHaveBeenCalledWith(
      "mydep",
      `https://github.com/org/repo#main@${SHA_NEW}`,
      expect.anything(),
    );
    expect(readToml()).toMatch(
      `other = "https://github.com/org/other#main@${SHA_OLD}"`,
    );
  });

  test("reports a failed github lookup and keeps going", async () => {
    makeProject(
      `[dependencies]\ncore = "1.0.0"\nmydep = "https://github.com/org/repo#main@${SHA_OLD}"\n`,
    );
    getHighestSemverBatch.mockResolvedValue({ ok: [["core", "1.2.0"]] });
    failGithub("API rate limit exceeded");

    await update();

    expect(output()).toMatch("Failed to update mydep: API rate limit exceeded");
    expect(process.exitCode).toBe(2);
    expect(readToml()).toMatch('core = "1.2.0"');
  });

  test("reports a failed re-pin without aborting the run", async () => {
    makeProject(githubToml(SHA_OLD));
    stubGithub(SHA_NEW);
    installFromGithub.mockRejectedValue(new Error("download failed"));

    await update();

    expect(output()).toMatch("Failed to update mydep: download failed");
    expect(readToml()).toMatch(SHA_OLD);
    expect(process.exitCode).toBe(2);
  });
});

// The single-pass contract: every new version is installed first, then one
// mops.toml write, one local-cache sync, one install notification, one
// integrity check.
describe("mops update single pass", () => {
  test("updates github and registry deps in one pass", async () => {
    makeProject(
      `[dependencies]\ncore = "1.0.0"\nmydep = "https://github.com/org/repo#main@${SHA_OLD}"\n\n[dev-dependencies]\ntest = "1.0.0"\n`,
    );
    getHighestSemverBatch.mockResolvedValue({
      ok: [
        ["core", "1.2.0"],
        ["test", "1.1.0"],
      ],
    });
    stubGithub(SHA_NEW);
    syncLocalCache.mockResolvedValue({ core: "1.2.0", test: "1.1.0" });

    await update();

    expect(output()).toMatchSnapshot();

    let toml = readToml();
    expect(toml).toMatch('core = "1.2.0"');
    expect(toml).toMatch(
      `mydep = "https://github.com/org/repo#main@${SHA_NEW}"`,
    );
    expect(toml).toMatch(/\[dev-dependencies\]\ntest = "1\.1\.0"/);

    expect(syncLocalCache).toHaveBeenCalledTimes(1);
    expect(notifyInstalls).toHaveBeenCalledTimes(1);
    expect(notifyInstalls).toHaveBeenCalledWith({
      core: "1.2.0",
      test: "1.1.0",
    });
    expect(checkIntegrity).toHaveBeenCalledTimes(1);
    expect(checkRequirements).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(0);
  });

  test("a failed dep keeps its mops.toml entry and does not block the others", async () => {
    makeProject('[dependencies]\ncore = "1.0.0"\nmap = "8.0.0"\n');
    getHighestSemverBatch.mockResolvedValue({
      ok: [
        ["core", "1.2.0"],
        ["map", "8.1.0"],
      ],
    });
    installMopsDep.mockImplementation(async (name: string) => name !== "map");

    await update();

    expect(output()).toMatch("Updated core 1.0.0 -> 1.2.0");
    expect(output()).toMatch("Failed to update map: install failed");
    let toml = readToml();
    expect(toml).toMatch('core = "1.2.0"');
    expect(toml).toMatch('map = "8.0.0"');
    expect(syncLocalCache).toHaveBeenCalledTimes(1);
    expect(notifyInstalls).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(2);
  });

  test("skips the install tail when every update failed", async () => {
    makeProject('[dependencies]\ncore = "1.0.0"\n');
    getHighestSemverBatch.mockResolvedValue({ ok: [["core", "1.2.0"]] });
    installMopsDep.mockResolvedValue(false);

    await update();

    expect(readToml()).toMatch('core = "1.0.0"');
    expect(syncLocalCache).not.toHaveBeenCalled();
    expect(notifyInstalls).not.toHaveBeenCalled();
    expect(checkIntegrity).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(2);
  });

  test("retries a transient network failure with a halved budget", async () => {
    makeProject('[dependencies]\ncore = "1.0.0"\n');
    getHighestSemverBatch.mockResolvedValue({ ok: [["core", "1.2.0"]] });
    installMopsDep.mockImplementationOnce(async () => {
      noteTransientNetworkError(new Error("fetch failed"));
      return false;
    });

    await update();

    expect(installMopsDep).toHaveBeenCalledTimes(2);
    expect(readToml()).toMatch('core = "1.2.0"');
    expect(process.exitCode).toBe(0);
  });

  test("mops update <pkg> updates only that registry dep", async () => {
    makeProject('[dependencies]\ncore = "1.0.0"\nmap = "8.0.0"\n');
    getHighestSemverBatch.mockResolvedValue({ ok: [["core", "1.2.0"]] });

    await update("core");

    expect(getHighestSemverBatch).toHaveBeenCalledWith([
      ["core", "1.0.0", { minor: null }],
    ]);
    expect(installMopsDep).toHaveBeenCalledTimes(1);
    let toml = readToml();
    expect(toml).toMatch('core = "1.2.0"');
    expect(toml).toMatch('map = "8.0.0"');
  });
});
