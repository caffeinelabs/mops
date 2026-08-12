import { afterEach, describe, expect, jest, test } from "@jest/globals";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { cli } from "./helpers";

// These projects declare local `path` dependencies only, so nothing here talks
// to the registry.
describe("local path dependency manifests keep mops.lock honest", () => {
  jest.setTimeout(120_000);

  const scratchDirs: string[] = [];

  afterEach(() => {
    for (const dir of scratchDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    scratchDirs.length = 0;
  });

  // Built at runtime rather than committed: every case here mutates a manifest,
  // and half of them are only interesting in a second MOPS_ENV.
  const makeProject = (files: Record<string, string>): string => {
    const root = mkdtempSync(
      path.join(import.meta.dirname, "install", "_tmp_local-dep-manifest_"),
    );
    scratchDirs.push(root);
    for (const [file, content] of Object.entries(files)) {
      const target = path.join(root, file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    return root;
  };

  const pkg = (name: string, deps = "") =>
    `[package]\nname = "${name}"\nversion = "1.0.0"\n${deps && `\n[dependencies]\n${deps}`}`;

  const readLock = (cwd: string) =>
    JSON.parse(readFileSync(path.join(cwd, "mops.lock"), "utf8"));

  const install = async (cwd: string, env: Record<string, string> = {}) => {
    const result = await cli(["install"], {
      cwd,
      env: { CI: undefined, ...env },
    });
    expect(result.stderr).not.toMatch(/RangeError|Maximum call stack/);
    return result;
  };

  test("a path dependency that gains a dependency of its own is installed", async () => {
    const cwd = makeProject({
      "mops.toml": '[dependencies]\nlib = "./lib"\n',
      "lib/mops.toml": pkg("lib"),
      "lib/src/lib.mo": "module {}\n",
      "nested/mops.toml": pkg("nested"),
      "nested/src/lib.mo": "module {}\n",
    });

    expect((await install(cwd)).exitCode).toBe(0);
    expect(readLock(cwd).deps).toEqual({ lib: "./lib" });

    writeFileSync(
      path.join(cwd, "lib/mops.toml"),
      pkg("lib", 'nested = "../nested"\n'),
    );

    expect((await install(cwd)).exitCode).toBe(0);
    expect(readLock(cwd).deps).toEqual({ lib: "./lib", nested: "./nested" });

    const sources = await cli(["sources", "--no-install"], {
      cwd,
      env: { CI: undefined },
    });
    expect(sources.exitCode).toBe(0);
    expect(sources.stdout).toMatch(/--package nested nested\/src/);
  });

  test("--locked rejects a lock written before a path dependency's manifest changed", async () => {
    const cwd = makeProject({
      "mops.toml": '[dependencies]\nlib = "./lib"\n',
      "lib/mops.toml": pkg("lib"),
      "lib/src/lib.mo": "module {}\n",
      "nested/mops.toml": pkg("nested"),
      "nested/src/lib.mo": "module {}\n",
    });

    expect((await install(cwd)).exitCode).toBe(0);
    const before = readFileSync(path.join(cwd, "mops.lock"), "utf8");

    writeFileSync(
      path.join(cwd, "lib/mops.toml"),
      pkg("lib", 'nested = "../nested"\n'),
    );

    const result = await cli(["install", "--locked"], {
      cwd,
      env: { CI: undefined },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(
      /mops\.lock does not match the local `path` dependencies/,
    );
    expect(readFileSync(path.join(cwd, "mops.lock"), "utf8")).toBe(before);
  });

  // A directory with no manifest must hash differently from one with an empty
  // manifest, or adding the file would leave the lock looking fresh.
  test("creating a manifest for a path dependency that had none invalidates the lock", async () => {
    const cwd = makeProject({
      "mops.toml": '[dependencies]\nlib = "./lib"\n',
      "lib/src/lib.mo": "module {}\n",
      "nested/mops.toml": pkg("nested"),
      "nested/src/lib.mo": "module {}\n",
    });

    expect((await install(cwd)).exitCode).toBe(0);
    expect(readLock(cwd).deps).toEqual({ lib: "./lib" });

    writeFileSync(
      path.join(cwd, "lib/mops.toml"),
      pkg("lib", 'nested = "../nested"\n'),
    );

    expect((await install(cwd)).exitCode).toBe(0);
    expect(readLock(cwd).deps.nested).toBe("./nested");
  });

  // Path deps chain and can point back at each other. The freshness walk must
  // terminate on its own — it runs before anything else can reject the project.
  test("a cycle between path dependency manifests does not blow the stack", async () => {
    const cwd = makeProject({
      "mops.toml": '[dependencies]\na = "./a"\n',
      "a/mops.toml": pkg("a", 'b = "../b"\n'),
      "a/src/lib.mo": "module {}\n",
      "b/mops.toml": pkg("b"),
      "b/src/lib.mo": "module {}\n",
    });

    expect((await install(cwd)).exitCode).toBe(0);

    writeFileSync(path.join(cwd, "b/mops.toml"), pkg("b", 'a = "../a"\n'));

    const result = await cli(["install", "--locked"], {
      cwd,
      env: { CI: undefined },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(
      /mops\.lock does not match the local `path` dependencies/,
    );
    expect(result.stderr).not.toMatch(/RangeError|Maximum call stack/);
  });

  // The freshness signal is only recorded for projects that declare a path
  // dependency, so locks written by a CLI that predates it stay valid.
  test("a project without path dependencies records no localDepsHash", async () => {
    const cwd = makeProject({ "mops.toml": "[dependencies]\n" });

    expect((await install(cwd)).exitCode).toBe(0);
    expect(readLock(cwd)).not.toHaveProperty("localDepsHash");

    const locked = await cli(["install", "--locked"], {
      cwd,
      env: { CI: undefined },
    });
    expect(locked.exitCode).toBe(0);
  });
});

describe("{MOPS_ENV} path dependencies re-resolve per environment", () => {
  jest.setTimeout(120_000);

  const scratchDirs: string[] = [];

  afterEach(() => {
    for (const dir of scratchDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    scratchDirs.length = 0;
  });

  const makeEnvProject = (): string => {
    const root = mkdtempSync(
      path.join(import.meta.dirname, "install", "_tmp_mops-env-dep_"),
    );
    scratchDirs.push(root);
    writeFileSync(
      path.join(root, "mops.toml"),
      '[dependencies]\nenvdep = "./envs/{MOPS_ENV}/dep"\n',
    );
    for (const env of ["local", "staging"]) {
      const dir = path.join(root, "envs", env, "dep");
      mkdirSync(path.join(dir, "src"), { recursive: true });
      writeFileSync(
        path.join(dir, "mops.toml"),
        '[package]\nname = "envdep"\nversion = "1.0.0"\n',
      );
      writeFileSync(path.join(dir, "src/lib.mo"), "module {}\n");
    }
    return root;
  };

  const readLock = (cwd: string) =>
    JSON.parse(readFileSync(path.join(cwd, "mops.lock"), "utf8"));

  test("install under a new MOPS_ENV re-resolves instead of keeping the old paths", async () => {
    const cwd = makeEnvProject();

    const first = await cli(["install"], {
      cwd,
      env: { CI: undefined, MOPS_ENV: "local" },
    });
    expect(first.exitCode).toBe(0);
    expect(readLock(cwd).deps.envdep).toBe("./envs/local/dep");

    const second = await cli(["install"], {
      cwd,
      env: { CI: undefined, MOPS_ENV: "staging" },
    });
    expect(second.exitCode).toBe(0);
    expect(readLock(cwd).deps.envdep).toBe("./envs/staging/dep");

    const sources = await cli(["sources", "--no-install"], {
      cwd,
      env: { CI: undefined, MOPS_ENV: "staging" },
    });
    expect(sources.stdout).toMatch(/--package envdep envs\/staging\/dep\/src/);
  });

  test("--locked rejects a lock generated under a different MOPS_ENV", async () => {
    const cwd = makeEnvProject();

    expect(
      (
        await cli(["install"], {
          cwd,
          env: { CI: undefined, MOPS_ENV: "local" },
        })
      ).exitCode,
    ).toBe(0);

    const result = await cli(["install", "--locked"], {
      cwd,
      env: { CI: undefined, MOPS_ENV: "staging" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/MOPS_ENV differs/);

    const same = await cli(["install", "--locked"], {
      cwd,
      env: { CI: undefined, MOPS_ENV: "local" },
    });
    expect(same.exitCode).toBe(0);
  });

  // `mops sources` never writes the lock, so a stale one must not be allowed to
  // feed the previous environment's paths to moc.
  test("sources under a new MOPS_ENV does not serve the locked environment's paths", async () => {
    const cwd = makeEnvProject();

    expect(
      (
        await cli(["install"], {
          cwd,
          env: { CI: undefined, MOPS_ENV: "local" },
        })
      ).exitCode,
    ).toBe(0);

    const sources = await cli(["sources", "--no-install"], {
      cwd,
      env: { CI: undefined, MOPS_ENV: "staging" },
    });
    expect(sources.exitCode).toBe(0);
    expect(sources.stdout).toMatch(/--package envdep envs\/staging\/dep\/src/);
    expect(sources.stdout).not.toMatch(/envs\/local\/dep/);
  });
});
