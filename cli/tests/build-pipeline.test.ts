import { describe, expect, jest, test } from "@jest/globals";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "path";
import { cleanFixture } from "./build-helpers";
import { cli } from "./helpers";

// Throwaway projects for build-pipeline edge cases that no committed fixture
// covers. Each one is removed after its test.
function project(files: Record<string, string>): string {
  // Inside the package: the test helper runs `npm run mops` from `cwd`.
  const parent = path.join(import.meta.dirname, "build-pipeline");
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(path.join(parent, "_tmp_"));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
  }
  return dir;
}

const ACTOR = "persistent actor { public func ping() : async () {} };\n";

describe("build pipeline", () => {
  jest.setTimeout(120_000);

  test("from a subdirectory, writes to the project root and leaves no lock files", async () => {
    const cwd = path.join(import.meta.dirname, "build/success");
    try {
      const result = await cli(["build", "foo"], {
        cwd: path.join(cwd, "src"),
      });
      expect(result.exitCode).toBe(0);
      expect(existsSync(path.join(cwd, ".mops/.build/foo.wasm"))).toBe(true);
      expect(existsSync(path.join(cwd, "src/.mops"))).toBe(false);
      expect(
        readdirSync(path.join(cwd, ".mops/.build")).filter((f) =>
          /lock$/.test(f),
        ),
      ).toEqual([]);
    } finally {
      cleanFixture(cwd);
      rmSync(path.join(cwd, "src/.mops"), { recursive: true, force: true });
    }
  });

  test("a rebuild that writes no Wasm fails instead of keeping the old one", async () => {
    const cwd = path.join(import.meta.dirname, "build/success");
    try {
      expect((await cli(["build", "foo"], { cwd })).exitCode).toBe(0);
      const result = await cli(["build", "foo", "--", "-o", "x.wasm"], {
        cwd,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch("moc did not write");
      expect(existsSync(path.join(cwd, ".mops/.build/foo.wasm"))).toBe(false);
    } finally {
      cleanFixture(
        cwd,
        ...["x.wasm", "x.did", "x.most"].map((f) => path.join(cwd, f)),
      );
    }
  });

  test.each([["build"], ["generate", "candid"]])(
    "mops %s rejects --enhanced-migration in [moc].args for a [migrations] canister",
    async (...command) => {
      const cwd = project({
        "mops.toml": [
          "[toolchain]",
          'moc = "1.16.1"',
          "[moc]",
          'args = ["--enhanced-migration=migrations"]',
          "[canisters.main]",
          'main = "Main.mo"',
          "[canisters.main.migrations]",
          'chain = "migrations"',
        ].join("\n"),
        "Main.mo": ACTOR,
        "migrations/.keep": "",
      });
      try {
        const result = await cli(command, { cwd });
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toMatch(
          "has [migrations] config but --enhanced-migration in [moc].args",
        );
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
  );

  test("rejects a string [build].args for a [migrations] canister with a clear error", async () => {
    const cwd = project({
      "mops.toml": [
        "[toolchain]",
        'moc = "1.16.1"',
        "[build]",
        'args = "--release"',
        "[canisters.main]",
        'main = "Main.mo"',
        "[canisters.main.migrations]",
        'chain = "migrations"',
      ].join("\n"),
      "Main.mo": ACTOR,
      "migrations/.keep": "",
    });
    try {
      const result = await cli(["build"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(
        "[build].args should be an array of strings",
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("fails on a missing baseline where --stable-baseline applies", async () => {
    const migrating = project({});
    const fixture = path.join(
      import.meta.dirname,
      "check-stable/migrations-chain",
    );
    cpSync(path.join(fixture, "src"), path.join(migrating, "src"), {
      recursive: true,
    });
    cpSync(
      path.join(fixture, "migrations"),
      path.join(migrating, "migrations"),
      {
        recursive: true,
      },
    );
    writeFileSync(
      path.join(migrating, "mops.toml"),
      [
        "[toolchain]",
        'moc = "1.16.1"',
        "[moc]",
        'args = ["--default-persistent-actors"]',
        "[canisters.backend]",
        'main = "src/main.mo"',
        "[canisters.backend.migrations]",
        'chain = "migrations"',
        "[canisters.backend.check-stable]",
        'path = "deployed.most"',
      ].join("\n"),
    );
    const classic = project({
      "mops.toml": [
        "[toolchain]",
        'moc = "1.16.1"',
        "[canisters.main]",
        'main = "Main.mo"',
        "[canisters.main.check-stable]",
        'path = "deployed.most"',
      ].join("\n"),
      "Main.mo": ACTOR,
    });
    try {
      const failed = await cli(["build"], { cwd: migrating });
      expect(failed.exitCode).toBe(1);
      expect(failed.stderr).toMatch("Deployed file not found");
      expect(
        existsSync(path.join(migrating, ".mops/.build/backend.wasm")),
      ).toBe(false);

      const quiet = await cli(["build"], { cwd: classic });
      expect(quiet.exitCode).toBe(0);
      expect(quiet.stderr).not.toMatch("--stable-baseline");
    } finally {
      rmSync(migrating, { recursive: true, force: true });
      rmSync(classic, { recursive: true, force: true });
    }
  });

  test("--check-deploy without a pocket-ic pin fails before compiling", async () => {
    const cwd = project({
      "mops.toml": [
        "[toolchain]",
        'moc = "1.16.1"',
        "[canisters.main]",
        'main = "Main.mo"',
      ].join("\n"),
      "Main.mo": ACTOR,
    });
    try {
      const result = await cli(["build", "--check-deploy"], {
        cwd,
        env: { MOPS_POCKET_IC_URL: undefined },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch("Tool 'pocket-ic' is not defined");
      expect(result.stdout).not.toMatch("build canister");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
