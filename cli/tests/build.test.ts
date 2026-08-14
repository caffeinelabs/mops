import { describe, expect, jest, test } from "@jest/globals";
import { execa } from "execa";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import path from "path";
import { cleanFixture } from "./build-helpers";
import { cli, cliSnapshot } from "./helpers";

const distBin = path.resolve(import.meta.dirname, "../dist/bin/mops.js");

// Core build behaviour. The `[optimize]`, Wasm-analysis and PocketIC
// check-deploy groups live in build-optimize / build-check-wasm /
// build-check-deploy: jest parallelises across files, not within one, so a
// single build suite made itself the tail of the entire run.
describe("build", () => {
  // Several dfx/pocket-ic builds per test; slow CI can exceed 60s default.
  jest.setTimeout(120_000);

  test("ok", async () => {
    const cwd = path.join(import.meta.dirname, "build/success");
    try {
      await cliSnapshot(["build", "--verbose"], { cwd }, 0);
      await cliSnapshot(["build", "foo"], { cwd }, 0);
      await cliSnapshot(["build", "bar"], { cwd }, 0);
      await cliSnapshot(["build", "foo", "bar"], { cwd }, 0);
    } finally {
      cleanFixture(cwd);
    }
  });

  test("error", async () => {
    const cwd = path.join(import.meta.dirname, "build/error");
    try {
      await cliSnapshot(["build", "foo", "--verbose"], { cwd }, 0);
      expect((await cliSnapshot(["build", "bar"], { cwd }, 1)).stderr).toMatch(
        "Candid compatibility check failed for canister bar",
      );
      expect(
        (await cliSnapshot(["build", "foo", "bar"], { cwd }, 1)).stderr,
      ).toMatch("Candid compatibility check failed for canister bar");
    } finally {
      cleanFixture(cwd);
    }
  });

  // [build].outputDir in mops.toml should control where build output goes
  test("custom output path via config outputDir", async () => {
    const cwd = path.join(import.meta.dirname, "build/custom-output");
    const customOut = path.join(cwd, "custom-out");
    const customWasm = path.join(customOut, "main.wasm");
    const customDid = path.join(customOut, "main.did");
    const customMost = path.join(customOut, "main.most");
    const defaultDid = path.join(cwd, ".mops/.build/main.did");

    try {
      const result = await cli(["build"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(existsSync(customWasm)).toBe(true);
      expect(existsSync(customDid)).toBe(true);
      expect(existsSync(customMost)).toBe(true);
      expect(existsSync(defaultDid)).toBe(false);
    } finally {
      cleanFixture(cwd, customOut);
    }
  });

  // Regression: --output CLI option was silently ignored due to
  // Commander storing it as options.output while build() read options.outputDir
  test("--output CLI option", async () => {
    const cwd = path.join(import.meta.dirname, "build/success");
    const outputDir = path.join(cwd, "cli-output-test");

    try {
      const result = await cli(["build", "foo", "--output", outputDir], {
        cwd,
      });
      expect(result.exitCode).toBe(0);
      expect(existsSync(path.join(outputDir, "foo.wasm"))).toBe(true);
      expect(existsSync(path.join(outputDir, "foo.did"))).toBe(true);
      expect(existsSync(path.join(outputDir, "foo.most"))).toBe(true);
    } finally {
      cleanFixture(cwd, outputDir);
    }
  });

  test("warns when args contain managed flags", async () => {
    const cwd = path.join(import.meta.dirname, "build/success");
    const artifact = path.join(cwd, "x");
    const artifactDid = path.join(cwd, "x.did");

    try {
      await cliSnapshot(
        ["build", "foo", "--", "-o", "x", "-c", "--idl", "--stable-types"],
        { cwd },
        1,
      );
    } finally {
      cleanFixture(cwd, artifact, artifactDid);
    }
  });

  test("parallel builds of the same canister both succeed", async () => {
    const cwd = path.join(import.meta.dirname, "build/success");
    try {
      const [a, b] = await Promise.all([
        cli(["build", "foo"], { cwd }),
        cli(["build", "foo"], { cwd }),
      ]);
      expect(a.exitCode).toBe(0);
      expect(b.exitCode).toBe(0);
      expect(existsSync(path.join(cwd, ".mops/.build/foo.wasm"))).toBe(true);
      expect(existsSync(path.join(cwd, ".mops/.build/foo.did"))).toBe(true);
      expect(existsSync(path.join(cwd, ".mops/.build/foo.most"))).toBe(true);
    } finally {
      cleanFixture(cwd);
    }
  });

  // Regression: bin/mops.js must route through environments/nodejs/cli.js
  // so that setWasmBindings() is called before any command runs.
  // The dev entry point (npm run mops) uses tsx and always worked;
  // this test exercises the compiled dist binary (same path as npm i -g ic-mops).
  const hasDistBin = existsSync(distBin);
  (hasDistBin ? test : test.skip)(
    "wasm bindings initialized via dist entry point",
    async () => {
      const cwd = path.join(import.meta.dirname, "build/success");
      try {
        const result = await execa("node", [distBin, "build", "foo"], {
          cwd,
          stdio: "pipe",
          reject: false,
        });

        expect(result.stderr).not.toContain("Wasm bindings have not been set");
        expect(result.exitCode).toBe(0);
      } finally {
        cleanFixture(cwd);
      }
    },
  );

  // Lives here rather than in build-check-deploy because it builds
  // `build/success`, and this file owns that fixture. Every test in it calls
  // `cleanFixture`, which removes `.mops` — from a parallel worker that would
  // delete a build another test is still using.
  test("--check-deploy requires a PocketIC pin", async () => {
    const cwd = path.join(import.meta.dirname, "build/success");
    try {
      const result = await cli(["build", "foo", "--check-deploy"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(
        "Tool 'pocket-ic' is not defined in [toolchain] section in mops.toml",
      );
      expect(result.stderr).toMatch("mops toolchain use pocket-ic 15.0.0");
    } finally {
      cleanFixture(cwd);
    }
  });

  // Anything that consumes mops as a build step — CI attestation, a canister
  // orchestrator, a cache keyed on artifact hashes — needs identical inputs to
  // produce identical outputs. Nothing else in the suite would catch a
  // timestamp or an iteration-order dependency creeping into the pipeline.
  test("repeated builds of the same source produce identical artifacts", async () => {
    const cwd = path.join(import.meta.dirname, "build/success");
    const outA = path.join(cwd, ".mops/.repro-a");
    const outB = path.join(cwd, ".mops/.repro-b");
    try {
      expect((await cli(["build", "-o", outA], { cwd })).exitCode).toBe(0);
      expect((await cli(["build", "-o", outB], { cwd })).exitCode).toBe(0);

      const artifacts = ["foo.wasm", "foo.did", "foo.most"];
      for (const name of artifacts) {
        const a = readFileSync(path.join(outA, name));
        const b = readFileSync(path.join(outB, name));
        expect(`${name}: ${createHash("sha256").update(b).digest("hex")}`).toBe(
          `${name}: ${createHash("sha256").update(a).digest("hex")}`,
        );
      }
    } finally {
      cleanFixture(cwd);
    }
  });

  // `build` used to install with `lock: "ignore"`, so a lockfile was never
  // written and a tampered `.mops/` went unnoticed on every build.
  describe("lock policy", () => {
    const cwd = path.join(import.meta.dirname, "build/success");
    const lockFile = path.join(cwd, "mops.lock");

    test("creates mops.lock without announcing it", async () => {
      rmSync(lockFile, { force: true });
      try {
        const result = await cli(["build", "foo"], {
          cwd,
          env: { CI: undefined },
        });
        expect(result.exitCode).toBe(0);
        expect(existsSync(lockFile)).toBe(true);
        expect(result.stdout).not.toMatch(/mops\.lock created/);
      } finally {
        cleanFixture(cwd, lockFile);
      }
    });

    // Integrity is verified at download time now, so builds no longer re-hash
    // `.mops/` — editing a dependency in place is tolerated (and is how some
    // debugging workflows operate). `mops verify` is the on-demand audit.
    test("tolerates a locally modified .mops/ file that mops verify rejects", async () => {
      rmSync(lockFile, { force: true });
      try {
        const first = await cli(["build", "foo"], {
          cwd,
          env: { CI: undefined },
        });
        expect(first.exitCode).toBe(0);

        appendFileSync(
          path.join(cwd, ".mops/core@1.0.0/src/Array.mo"),
          "\n// tampered\n",
        );

        const result = await cli(["build", "foo"], {
          cwd,
          env: { CI: undefined },
        });
        expect(result.exitCode).toBe(0);
        expect(result.stderr).not.toMatch(/Integrity check failed/);

        const verify = await cli(["verify"], { cwd, env: { CI: undefined } });
        expect(verify.exitCode).toBe(1);
        expect(verify.stderr).toMatch(
          /\.mops\/core@1\.0\.0\/src\/Array\.mo does not match mops\.lock/,
        );
      } finally {
        cleanFixture(cwd, lockFile);
      }
    });
  });
});
