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
const add = jest.fn<(...args: any[]) => Promise<any>>();

// `api/actors` pulls in the generated `*.did.js` declarations, which the ESM
// `.js` -> extensionless moduleNameMapper resolves to the raw `.did` files.
jest.unstable_mockModule("../api/actors.js", () => ({
  mainActor: jest.fn(async () => ({ getHighestSemverBatch })),
  mainOnewayCall: jest.fn(),
  storageActor: jest.fn(),
}));

// `add` installs and rewrites mops.toml; the tests here only assert what
// `update` asks it to write.
jest.unstable_mockModule("../commands/add.js", () => ({ add }));

jest.unstable_mockModule("../integrity.js", () => ({
  checkIntegrity: jest.fn(async () => {}),
}));

const { update } = await import("../commands/update.js");

const SHA_OLD = "1111111111111111111111111111111111111111";
const SHA_NEW = "2222222222222222222222222222222222222222";

let originalCwd = process.cwd();
let originalFetch = globalThis.fetch;
let logs: string[] = [];
let logSpy: ReturnType<typeof jest.spyOn>;

const makeProject = (toml: string) => {
  let root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "mops-update-")),
  );
  fs.writeFileSync(path.join(root, "mops.toml"), toml);
  process.chdir(root);
  return root;
};

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
  getHighestSemverBatch.mockReset();
  add.mockReset();
  add.mockResolvedValue(undefined);
  process.exitCode = 0;
});

afterEach(() => {
  logSpy.mockRestore();
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
    expect(add).not.toHaveBeenCalled();
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
    expect(add).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  test("exits 0 after applying an update", async () => {
    makeProject('[dependencies]\ncore = "1.0.0"\n');
    getHighestSemverBatch.mockResolvedValue({ ok: [["core", "1.2.0"]] });

    await update();

    expect(add).toHaveBeenCalledWith(
      "core@1.2.0",
      { dev: false, lock: "skip" },
      "core",
    );
    expect(process.exitCode).toBe(0);
  });

  test("writes a dev-dependency back to [dev-dependencies]", async () => {
    makeProject('[dev-dependencies]\ntest = "1.0.0"\n');
    getHighestSemverBatch.mockResolvedValue({ ok: [["test", "1.1.0"]] });

    await update();

    expect(add).toHaveBeenCalledWith(
      "test@1.1.0",
      { dev: true, lock: "skip" },
      "test",
    );
    expect(process.exitCode).toBe(0);
  });

  test("keeps the pinned alias as the mops.toml key", async () => {
    makeProject('[dependencies]\n"core@1" = "1.0.0"\n');
    getHighestSemverBatch.mockResolvedValue({ ok: [["core", "1.5.0"]] });

    await update();

    expect(add).toHaveBeenCalledWith(
      "core@1.5.0",
      { dev: false, lock: "skip" },
      "core@1",
    );
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

    expect(add).toHaveBeenCalledWith(
      `https://github.com/org/repo#main@${SHA_NEW}`,
      { dev: false, lock: "skip" },
      "mydep",
    );
    expect(process.exitCode).toBe(0);
  });

  test("does not touch a dep already pinned to the branch head", async () => {
    makeProject(githubToml(SHA_OLD));
    stubGithub(SHA_OLD);

    await update();

    expect(add).not.toHaveBeenCalled();
  });

  test("re-pins a github dev-dependency into [dev-dependencies]", async () => {
    makeProject(
      `[dev-dependencies]\nmydep = "https://github.com/org/repo#main@${SHA_OLD}"\n`,
    );
    stubGithub(SHA_NEW);

    await update();

    expect(add).toHaveBeenCalledWith(
      `https://github.com/org/repo#main@${SHA_NEW}`,
      { dev: true, lock: "skip" },
      "mydep",
    );
  });

  test("updates only the requested github dep", async () => {
    makeProject(
      `[dependencies]\nmydep = "https://github.com/org/repo#main@${SHA_OLD}"\nother = "https://github.com/org/other#main@${SHA_OLD}"\n`,
    );
    stubGithub(SHA_NEW);

    await update("mydep");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      `https://github.com/org/repo#main@${SHA_NEW}`,
      { dev: false, lock: "skip" },
      "mydep",
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
    expect(add).toHaveBeenCalledWith(
      "core@1.2.0",
      { dev: false, lock: "skip" },
      "core",
    );
  });

  test("reports a failed re-pin without aborting the run", async () => {
    makeProject(githubToml(SHA_OLD));
    stubGithub(SHA_NEW);
    add.mockRejectedValue(new Error("download failed"));

    await update();

    expect(output()).toMatch("Failed to update mydep: download failed");
    expect(process.exitCode).toBe(2);
  });
});
