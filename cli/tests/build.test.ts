import { describe, expect, jest, test } from "@jest/globals";
import { execa } from "execa";
import { existsSync, rmSync } from "node:fs";
import path from "path";
import { cli, cliSnapshot } from "./helpers";

const distBin = path.resolve(import.meta.dirname, "../dist/bin/mops.js");

function cleanFixture(cwd: string, ...extras: string[]) {
  rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
  for (const p of extras) {
    rmSync(p, { recursive: true, force: true });
  }
}

describe("build", () => {
  // Several dfx/pocket-ic builds per test; slow CI (e.g. node 20 matrix) can exceed 60s default.
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
    const defaultDid = path.join(cwd, ".mops/.build/main.did");

    try {
      const result = await cli(["build"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(existsSync(customWasm)).toBe(true);
      expect(existsSync(customDid)).toBe(true);
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
        ["build", "foo", "--", "-o", "x", "-c", "--idl"],
        { cwd },
        1,
      );
    } finally {
      cleanFixture(cwd, artifact, artifactDid);
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
});
