import { describe, expect, jest, test } from "@jest/globals";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// `api/actors` pulls in the generated `*.did.js` declarations, which the ESM
// `.js` -> extensionless moduleNameMapper resolves to the raw `.did` files.
// Only the pure planning helpers are under test here.
jest.unstable_mockModule("../api/actors.js", () => ({
  mainActor: jest.fn(),
  mainOnewayCall: jest.fn(),
  storageActor: jest.fn(),
}));

const { computeSyncPlan, getSourceFiles, parseImportedPackage } =
  await import("../commands/sync.js");

type SyncPlan = {
  add: { name: string; dev: boolean }[];
  remove: { name: string; dev: boolean }[];
};

const used = (prod: string[] = [], dev: string[] = []) => ({
  prod: new Set(prod),
  dev: new Set(dev),
});

const declared = (deps: string[] = [], devDeps: string[] = []) => ({
  deps: new Set(deps),
  devDeps: new Set(devDeps),
});

const plan = (p: SyncPlan) => ({
  add: p.add.map((e) => `${e.name}${e.dev ? " (dev)" : ""}`),
  remove: p.remove.map((e) => `${e.name}${e.dev ? " (dev)" : ""}`),
});

describe("parseImportedPackage", () => {
  test("keeps the pinned alias", () => {
    expect(parseImportedPackage("mo:map@8.1.0/Map")).toBe("map@8.1.0");
    expect(parseImportedPackage("mo:map@8.1.0")).toBe("map@8.1.0");
  });

  test("returns the package name of a plain import", () => {
    expect(parseImportedPackage("mo:core/Array")).toBe("core");
    expect(parseImportedPackage("mo:core")).toBe("core");
    expect(parseImportedPackage("mo:core/Array\r")).toBe("core");
  });

  test("skips non-package deps", () => {
    expect(parseImportedPackage("mo:prim")).toBeUndefined();
    expect(parseImportedPackage("mo:⛔")).toBeUndefined();
    expect(parseImportedPackage("canister:foo")).toBeUndefined();
    expect(parseImportedPackage("/abs/path/Lib.mo")).toBeUndefined();
  });
});

// A pinned alias (`"map@8.1.0" = "8.1.0"`) is imported as `mo:map@8.1.0`, so
// the used set and the declared keys live in the same namespace. Reducing
// either side to the base name made sync add-then-remove the `map` key.
describe("computeSyncPlan pinned aliases", () => {
  test("alias declared and used is left alone", () => {
    expect(
      plan(computeSyncPlan(used(["map@8.1.0"]), declared(["map@8.1.0"]))),
    ).toEqual({ add: [], remove: [] });
  });

  test("alias declared but unused is removed, and only the alias key", () => {
    expect(plan(computeSyncPlan(used([]), declared(["map@8.1.0"])))).toEqual({
      add: [],
      remove: ["map@8.1.0"],
    });
  });

  test("base name and alias both declared and both used", () => {
    expect(
      plan(
        computeSyncPlan(
          used(["map", "map@8.1.0"]),
          declared(["map", "map@8.1.0"]),
        ),
      ),
    ).toEqual({ add: [], remove: [] });
  });

  test("using the base name does not keep an unused alias alive", () => {
    expect(
      plan(computeSyncPlan(used(["map"]), declared(["map", "map@8.1.0"]))),
    ).toEqual({ add: [], remove: ["map@8.1.0"] });
  });

  test("an undeclared alias import is added under its alias key", () => {
    expect(
      plan(computeSyncPlan(used(["map", "map@8.1.0"]), declared(["map"]))),
    ).toEqual({ add: ["map@8.1.0"], remove: [] });
  });

  test("a plain package with no alias round-trips", () => {
    expect(plan(computeSyncPlan(used(["core"]), declared(["core"])))).toEqual({
      add: [],
      remove: [],
    });
  });
});

describe("getSourceFiles", () => {
  const makeProject = (files: string[]) => {
    let root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "mops-sync-sources-")),
    );
    for (let file of files) {
      fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), "");
    }
    return root;
  };

  test("classifies test and bench sources as dev", () => {
    let root = makeProject([
      "src/Main.mo",
      "test/main.test.mo",
      "test/utils.mo",
      "tests/nested/other.test.mo",
      "bench/main.bench.mo",
      "benchmark/other.bench.mo",
      "src/latest/Contest.mo",
      "node_modules/pkg/Ignored.mo",
      ".mops/dep/Ignored.mo",
    ]);
    let files = getSourceFiles(root);
    expect(files.prod.sort()).toEqual(["src/Main.mo", "src/latest/Contest.mo"]);
    expect(files.dev.sort()).toEqual([
      "bench/main.bench.mo",
      "benchmark/other.bench.mo",
      "test/main.test.mo",
      "test/utils.mo",
      "tests/nested/other.test.mo",
    ]);
  });
});

describe("computeSyncPlan dev classification", () => {
  test("a package used only from test/bench sources becomes a dev dependency", () => {
    expect(plan(computeSyncPlan(used([], ["test"]), declared()))).toEqual({
      add: ["test (dev)"],
      remove: [],
    });
  });

  test("a package used in both goes to dependencies", () => {
    expect(plan(computeSyncPlan(used(["core"], ["core"]), declared()))).toEqual(
      {
        add: ["core"],
        remove: [],
      },
    );
  });

  test("dev usage keeps a production dependency declared", () => {
    expect(
      plan(computeSyncPlan(used([], ["core"]), declared(["core"]))),
    ).toEqual({ add: [], remove: [] });
  });

  test("production usage keeps a dev dependency declared", () => {
    expect(
      plan(computeSyncPlan(used(["core"]), declared([], ["core"]))),
    ).toEqual({ add: [], remove: [] });
  });

  test("an unused package declared in both sections is removed from both", () => {
    expect(
      plan(computeSyncPlan(used([]), declared(["core"], ["core"]))),
    ).toEqual({ add: [], remove: ["core", "core (dev)"] });
  });

  test("an unused dev dependency is removed as dev", () => {
    expect(plan(computeSyncPlan(used([]), declared([], ["test"])))).toEqual({
      add: [],
      remove: ["test (dev)"],
    });
  });
});
