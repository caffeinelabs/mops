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

// `api/actors` pulls in the generated `*.did.js` declarations, which the ESM
// `.js` -> extensionless moduleNameMapper resolves to the raw `.did` files.
jest.unstable_mockModule("../api/actors.js", () => ({
  mainActor: jest.fn(async () => ({ getHighestSemverBatch })),
  mainOnewayCall: jest.fn(),
  storageActor: jest.fn(),
}));

const { outdated } = await import("../commands/outdated.js");

const SHA_OLD = "1111111111111111111111111111111111111111";
const SHA_NEW = "2222222222222222222222222222222222222222";

let originalCwd = process.cwd();
let originalFetch = globalThis.fetch;
let logs: string[] = [];
let logSpy: ReturnType<typeof jest.spyOn>;

const makeProject = (toml: string) => {
  let root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "mops-outdated-")),
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
  logs.join("\n").replace(new RegExp(`\\[[0-9;]*m`, "g"), "");

beforeEach(() => {
  logs = [];
  logSpy = jest.spyOn(console, "log").mockImplementation((...args: any[]) => {
    logs.push(args.join(" "));
  });
  getHighestSemverBatch.mockReset();
  process.exitCode = 0;
});

afterEach(() => {
  logSpy.mockRestore();
  globalThis.fetch = originalFetch;
  process.chdir(originalCwd);
  process.exitCode = 0;
});

describe("mops outdated exit codes", () => {
  test("exits 0 when everything is up to date", async () => {
    makeProject('[dependencies]\ncore = "1.0.0"\n');
    getHighestSemverBatch.mockResolvedValue({ ok: [["core", "1.0.0"]] });

    await outdated();

    expect(output()).toMatch("All dependencies are up to date!");
    expect(process.exitCode).toBe(0);
  });

  test("exits 1 when a mops dependency is outdated", async () => {
    makeProject('[dependencies]\ncore = "1.0.0"\n');
    getHighestSemverBatch.mockResolvedValue({ ok: [["core", "1.2.0"]] });

    await outdated();

    expect(output()).toMatch("core 1.0.0 -> 1.2.0");
    expect(process.exitCode).toBe(1);
  });

  test("exits 1 for an outdated dev-dependency", async () => {
    makeProject('[dev-dependencies]\ntest = "1.0.0"\n');
    getHighestSemverBatch.mockResolvedValue({ ok: [["test", "1.1.0"]] });

    await outdated();

    expect(output()).toMatch("test 1.0.0 -> 1.1.0");
    expect(process.exitCode).toBe(1);
  });

  test("exits 2 on a registry error, without claiming anything is up to date", async () => {
    makeProject('[dependencies]\ncore = "1.0.0"\n');
    getHighestSemverBatch.mockResolvedValue({ err: "Package not found" });

    await outdated();

    expect(output()).toMatch("Package not found");
    expect(output()).not.toMatch("up to date");
    expect(process.exitCode).toBe(2);
  });

  test("exits 2 when the registry call fails", async () => {
    makeProject('[dependencies]\ncore = "1.0.0"\n');
    getHighestSemverBatch.mockRejectedValue(new Error("fetch failed"));

    await outdated();

    expect(output()).toMatch("fetch failed");
    expect(output()).not.toMatch("up to date");
    expect(process.exitCode).toBe(2);
  });

  test("exits 2 when mops.toml is missing", async () => {
    let root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "mops-outdated-empty-")),
    );
    process.chdir(root);

    await outdated();

    expect(output()).toMatch("mops.toml' not found");
    expect(process.exitCode).toBe(2);
  });

  test("does not call the registry when there is nothing to check", async () => {
    makeProject('[package]\nname = "test"\n');

    await outdated();

    expect(getHighestSemverBatch).not.toHaveBeenCalled();
    expect(output()).toMatch("All dependencies are up to date!");
    expect(process.exitCode).toBe(0);
  });
});

// `mops update` re-resolves GitHub branches, so `mops outdated` must report them
// or it would print "up to date" for a dep that `update` would move.
describe("mops outdated github dependencies", () => {
  const githubToml = (sha: string) =>
    `[dependencies]\nmydep = "https://github.com/org/repo#main@${sha}"\n`;

  test("reports a GitHub dep whose branch moved and exits 1", async () => {
    makeProject(githubToml(SHA_OLD));
    stubGithub(SHA_NEW);

    await outdated();

    expect(output()).toMatch(
      "mydep 1111111 -> 2222222 (github: org/repo#main)",
    );
    expect(process.exitCode).toBe(1);
  });

  test("exits 0 when the pinned commit is the branch head", async () => {
    makeProject(githubToml(SHA_OLD));
    stubGithub(SHA_OLD);

    await outdated();

    expect(output()).toMatch("All dependencies are up to date!");
    expect(process.exitCode).toBe(0);
  });

  test("reports a branch pinned without a commit as unpinned", async () => {
    makeProject('[dependencies]\nmydep = "https://github.com/org/repo#main"\n');
    stubGithub(SHA_NEW);

    await outdated();

    expect(output()).toMatch("mydep unpinned -> 2222222");
    expect(process.exitCode).toBe(1);
  });

  test("exits 2 when a GitHub lookup fails", async () => {
    makeProject(githubToml(SHA_OLD));
    failGithub("API rate limit exceeded");

    await outdated();

    expect(output()).toMatch("Failed to check mydep: API rate limit exceeded");
    expect(output()).not.toMatch("up to date");
    expect(process.exitCode).toBe(2);
  });

  test("a failed GitHub lookup outranks found mops updates", async () => {
    makeProject(
      `[dependencies]\ncore = "1.0.0"\nmydep = "https://github.com/org/repo#main@${SHA_OLD}"\n`,
    );
    getHighestSemverBatch.mockResolvedValue({ ok: [["core", "1.2.0"]] });
    failGithub("API rate limit exceeded");

    await outdated();

    expect(output()).toMatch("core 1.0.0 -> 1.2.0");
    expect(process.exitCode).toBe(2);
  });
});

describe("mops outdated [pkg]", () => {
  test("reports only the requested package", async () => {
    makeProject('[dependencies]\ncore = "1.0.0"\nmap = "1.0.0"\n');
    getHighestSemverBatch.mockResolvedValue({ ok: [["core", "1.2.0"]] });

    await outdated("core");

    expect(getHighestSemverBatch).toHaveBeenCalledWith([
      ["core", "1.0.0", { minor: null }],
    ]);
    expect(output()).toMatch("core 1.0.0 -> 1.2.0");
    expect(output()).not.toMatch("map");
    expect(process.exitCode).toBe(1);
  });

  test("exits 0 when the requested package is up to date", async () => {
    makeProject('[dependencies]\ncore = "1.0.0"\nmap = "1.0.0"\n');
    getHighestSemverBatch.mockResolvedValue({ ok: [["core", "1.0.0"]] });

    await outdated("core");

    expect(output()).toMatch('Package "core" is up to date!');
    expect(process.exitCode).toBe(0);
  });

  test("checks only the requested GitHub dep", async () => {
    makeProject(
      `[dependencies]\nmydep = "https://github.com/org/repo#main@${SHA_OLD}"\nother = "https://github.com/org/other#main@${SHA_OLD}"\n`,
    );
    stubGithub(SHA_NEW);

    await outdated("mydep");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(output()).toMatch("mydep 1111111 -> 2222222");
    expect(output()).not.toMatch("other");
    expect(process.exitCode).toBe(1);
  });

  test("exits 2 for a package that is not a dependency", async () => {
    makeProject('[dependencies]\ncore = "1.0.0"\n');

    await outdated("nope");

    expect(output()).toMatch('Package "nope" is not installed!');
    expect(getHighestSemverBatch).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });
});
