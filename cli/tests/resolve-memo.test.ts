import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

// The memo is in-process module state, so these drive `resolveDepsAndGraph`
// directly — one CLI subprocess per resolve could never share a memo.
//
// Every case is checked with the same canary: the global cache's copy of a
// published package's manifest. It is deliberately not part of the memo key
// (published versions are immutable), so editing it is invisible to a memo hit
// and shows up in the result only when a walk actually reruns.
describe("resolve memoization", () => {
  jest.setTimeout(60_000);

  type ResolvePackages = typeof import("../resolve-packages.js");
  let resolvePackages: ResolvePackages;

  let cacheHome: string;
  let cwdBefore = process.cwd();
  let tempDirs: string[] = [];

  const cachedPackage = (name: string, version: string, deps = "") => {
    let dir = path.join(cacheHome, "mops", "packages", `${name}@${version}`);
    mkdirSync(dir, { recursive: true });
    let file = path.join(dir, "mops.toml");
    writeFileSync(
      file,
      `[package]\nname = "${name}"\nversion = "${version}"\n\n[dependencies]\n${deps}`,
    );
    return file;
  };

  // The next walk — and only a walk — picks this up.
  const armCanary = () => cachedPackage("test", "1.0.0", 'canary = "1.0.0"\n');
  const disarmCanary = () => cachedPackage("test", "1.0.0");
  const walked = (result: { deps: Record<string, string> }) =>
    "canary" in result.deps;

  const project = (files: Record<string, string>): string => {
    let dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), "mops-memo-")));
    tempDirs.push(dir);
    write(dir, files);
    process.chdir(dir);
    return dir;
  };

  const write = (dir: string, files: Record<string, string>) => {
    for (let [rel, content] of Object.entries(files)) {
      let file = path.join(dir, rel);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
  };

  const root = (deps: string) =>
    `[package]\nname = "root"\nversion = "1.0.0"\n\n[dependencies]\n${deps}`;

  beforeAll(async () => {
    // `globalCacheDir` is read at import time, so the override has to be set
    // before the module under test is loaded.
    cacheHome = realpathSync(
      mkdtempSync(path.join(os.tmpdir(), "mops-memo-cache-")),
    );
    process.env.XDG_CACHE_HOME = cacheHome;
    delete process.env.MOPS_ENV;
    cachedPackage("test", "1.0.0");
    cachedPackage("canary", "1.0.0");
    resolvePackages = await import("../resolve-packages.js");
  });

  beforeEach(() => {
    disarmCanary();
  });

  afterEach(() => {
    process.chdir(cwdBefore);
    resolvePackages.setConflictPolicy("warning");
    delete process.env.MOPS_ENV;
    for (let dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs = [];
  });

  afterAll(() => {
    rmSync(cacheHome, { recursive: true, force: true });
    delete process.env.XDG_CACHE_HOME;
  });

  test("a second resolve with identical inputs does not walk again", async () => {
    project({ "mops.toml": root('test = "1.0.0"\na = "./a"\n') });

    let first = await resolvePackages.resolveDepsAndGraph();
    expect(walked(first)).toBe(false);
    armCanary();

    let second = await resolvePackages.resolveDepsAndGraph();
    expect(walked(second)).toBe(false);
    expect(second.deps).toEqual(first.deps);
  });

  test("the memoized result is copied, not shared", async () => {
    project({ "mops.toml": root('test = "1.0.0"\n') });

    armCanary();
    let first = await resolvePackages.resolveDepsAndGraph();
    first.deps.test = "tampered";
    first.graph["test@1.0.0"]!.canary = "tampered";

    let second = await resolvePackages.resolveDepsAndGraph();
    expect(second.deps.test).toBe("1.0.0");
    expect(second.graph["test@1.0.0"]).toEqual({ canary: "1.0.0" });
  });

  test("editing the root mops.toml invalidates", async () => {
    let dir = project({ "mops.toml": root('test = "1.0.0"\n') });

    await resolvePackages.resolveDepsAndGraph();
    armCanary();
    write(dir, { "mops.toml": root('test = "1.0.0"\nextra = "./extra"\n') });

    let second = await resolvePackages.resolveDepsAndGraph();
    expect(walked(second)).toBe(true);
    expect(second.deps.extra).toBe("./extra");
  });

  test("a mops.lock written mid-command invalidates", async () => {
    let dir = project({ "mops.toml": root('test = "1.0.0"\n') });

    await resolvePackages.resolveDepsAndGraph();
    armCanary();
    // Content is what the key covers; an unusable lock still forces a re-walk.
    write(dir, { "mops.lock": "{}" });

    expect(walked(await resolvePackages.resolveDepsAndGraph())).toBe(true);
  });

  test("editing a local path dep manifest invalidates at any depth", async () => {
    let dir = project({
      "mops.toml": root('test = "1.0.0"\na = "./a"\n'),
      "a/mops.toml": `[package]\nname = "a"\nversion = "1.0.0"\n\n[dependencies]\nb = "./b"\n`,
      "a/b/mops.toml": `[package]\nname = "b"\nversion = "1.0.0"\n\n[dependencies]\n`,
    });

    await resolvePackages.resolveDepsAndGraph();
    armCanary();
    // two levels below the root, and reached only through another local dep
    write(dir, {
      "a/b/mops.toml": `[package]\nname = "b"\nversion = "1.0.0"\n\n[dependencies]\nc = "./c"\n`,
    });

    let second = await resolvePackages.resolveDepsAndGraph();
    expect(second.deps.c).toBe("./a/b/c");
    expect(walked(second)).toBe(true);
  });

  test("creating a local path dep manifest that did not exist invalidates", async () => {
    let dir = project({ "mops.toml": root('test = "1.0.0"\na = "./a"\n') });

    let first = await resolvePackages.resolveDepsAndGraph();
    expect(first.deps.a).toBe("./a");
    armCanary();
    // the absent manifest is recorded too, so appearing counts as a change
    write(dir, {
      "a/mops.toml": `[package]\nname = "a"\nversion = "1.0.0"\n\n[dependencies]\nd = "./d"\n`,
    });

    let second = await resolvePackages.resolveDepsAndGraph();
    expect(second.deps.d).toBe("./a/d");
    expect(walked(second)).toBe(true);
  });

  test("changing MOPS_ENV invalidates", async () => {
    project({
      "mops.toml": root('test = "1.0.0"\nenv = "./{MOPS_ENV}-dep"\n'),
    });

    let first = await resolvePackages.resolveDepsAndGraph();
    expect(first.deps.env).toBe("./local-dep");
    armCanary();
    process.env.MOPS_ENV = "staging";

    let second = await resolvePackages.resolveDepsAndGraph();
    expect(second.deps.env).toBe("./staging-dep");
    expect(walked(second)).toBe(true);
  });

  test("changing the conflict policy invalidates", async () => {
    project({ "mops.toml": root('test = "1.0.0"\n') });

    await resolvePackages.resolveDepsAndGraph();
    armCanary();
    resolvePackages.setConflictPolicy("ignore");

    expect(walked(await resolvePackages.resolveDepsAndGraph())).toBe(true);
  });

  test("a caller sharing an in-flight walk re-checks local manifests", async () => {
    let noDeps = `[package]\nname = "a"\nversion = "1.0.0"\n\n[dependencies]\n`;
    // The local dep comes first: the walk reads its manifest synchronously,
    // before the first suspension point, so the edit below always lands
    // after that read — and the second call, made in the same tick, always
    // finds the first walk still in flight and shares its promise.
    let dir = project({
      "mops.toml": root('a = "./a"\ntest = "1.0.0"\n'),
      "a/mops.toml": noDeps,
    });

    let first = resolvePackages.resolveDepsAndGraph();
    write(dir, {
      "a/mops.toml": `[package]\nname = "a"\nversion = "1.0.0"\n\n[dependencies]\nc = "./c"\n`,
    });
    let second = resolvePackages.resolveDepsAndGraph();

    // the first walk read the pre-edit manifest ...
    expect((await first).deps.c).toBeUndefined();
    // ... so the sharer must detect the edit on settle and walk again
    expect((await second).deps.c).toBe("./a/c");
  });

  test("a walk that threw is not served to the next caller", async () => {
    let good = `[package]\nname = "a"\nversion = "1.0.0"\n\n[dependencies]\n`;
    let dir = project({
      "mops.toml": root('test = "1.0.0"\na = "./a"\n'),
      "a/mops.toml": good,
    });

    let first = await resolvePackages.resolveDepsAndGraph();

    write(dir, { "a/mops.toml": "this is not toml = = =" });
    await expect(resolvePackages.resolveDepsAndGraph()).rejects.toThrow();

    // Restoring the manifest restores the key of the successful walk, so a
    // cached rejection would be handed straight back instead of re-walking.
    write(dir, { "a/mops.toml": good });
    let third = await resolvePackages.resolveDepsAndGraph();
    expect(third.deps).toEqual(first.deps);
  });
});
