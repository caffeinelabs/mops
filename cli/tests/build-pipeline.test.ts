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
const MOPS_TOML = [
  "[toolchain]",
  'moc = "1.16.1"',
  "[canisters.main]",
  'main = "src/Main.mo"',
].join("\n");

describe("build pipeline", () => {
  jest.setTimeout(120_000);

  test("from a subdirectory, writes to the project root and leaves no lock files", async () => {
    const cwd = project({
      "mops.toml": MOPS_TOML,
      "src/Main.mo": ACTOR,
    });
    try {
      const result = await cli(["build"], { cwd: path.join(cwd, "src") });
      expect(result.exitCode).toBe(0);
      expect(existsSync(path.join(cwd, ".mops/.build/main.wasm"))).toBe(true);
      expect(existsSync(path.join(cwd, "src/.mops"))).toBe(false);
      expect(
        readdirSync(path.join(cwd, ".mops/.build")).filter((f) =>
          /lock$/.test(f),
        ),
      ).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test.each([
    ["build", ["build", "--", "-o", "x.wasm"], ""],
    ["build", ["build", "--", "-o=x.wasm"], ""],
    ["build", ["build"], '[moc]\nargs = ["-o", "x.wasm"]'],
    ["build", ["build"], '[build]\nargs = ["-o=x.wasm"]'],
    ["generate candid", ["generate", "candid", "--", "-o", "x.did"], ""],
  ])(
    "mops %s rejects -o in the moc args before compiling (%j)",
    async (command, args, extraToml) => {
      const cwd = project({
        "mops.toml": `${extraToml}\n${MOPS_TOML}`,
        "src/Main.mo": ACTOR,
      });
      try {
        const result = await cli(args, { cwd });
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toMatch(
          `'-o' in the moc args for canister main is not supported by mops ${command}`,
        );
        expect(readdirSync(cwd).filter((f) => f.startsWith("x."))).toEqual([]);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
  );

  test("a rejected -o leaves no staged migration chain", async () => {
    const cwd = project({});
    const fixture = path.join(
      import.meta.dirname,
      "check-stable/migrations-chain",
    );
    for (const dir of ["src", "migrations"]) {
      cpSync(path.join(fixture, dir), path.join(cwd, dir), {
        recursive: true,
      });
    }
    writeFileSync(
      path.join(cwd, "mops.toml"),
      [
        "[toolchain]",
        'moc = "1.16.1"',
        "[moc]",
        'args = ["--default-persistent-actors"]',
        "[canisters.backend]",
        'main = "src/main.mo"',
        "[canisters.backend.migrations]",
        'chain = "migrations"',
        "build-limit = 1",
      ].join("\n"),
    );
    try {
      const result = await cli(["build", "--", "-o", "x.wasm"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch("'-o' in the moc args");
      // Staging dirs get a random suffix: `.migrations-backend-XXXXXX`.
      expect(
        readdirSync(cwd).filter((f) => f.startsWith(".migrations-backend")),
      ).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
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
        "[build] config 'args' should be an array of strings",
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
  test("--check-deploy says to set initArg when the default () does not fit", async () => {
    const cwd = project({
      "mops.toml": MOPS_TOML,
      "src/Main.mo":
        "persistent actor class Main(start : Nat) { public func get() : async Nat { start } };\n",
    });
    try {
      const result = await cli(["build", "--check-deploy"], {
        cwd,
        // Encoding fails before mops connects, so no PocketIC is needed.
        env: { MOPS_POCKET_IC_URL: "http://127.0.0.1:1" },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(
        "Cannot encode the default init argument () for canister main",
      );
      expect(result.stderr).toMatch("Set [canisters.main].initArg");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
