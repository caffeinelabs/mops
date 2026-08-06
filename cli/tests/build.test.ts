import { describe, expect, jest, test } from "@jest/globals";
import { execa } from "execa";
import { existsSync, linkSync, rmSync } from "node:fs";
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

  test("[optimize] runs wasm-opt after build", async () => {
    const cwd = path.join(import.meta.dirname, "build/optimize");
    const stamp = path.join(cwd, ".mops/.build/.wasm-opt-ran");
    try {
      const result = await cli(["build", "--verbose"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stdout + result.stderr).toMatch(/Optimized main\.wasm/);
      expect(existsSync(path.join(cwd, ".mops/.build/main.wasm"))).toBe(true);
      expect(existsSync(stamp)).toBe(true);
    } finally {
      cleanFixture(cwd);
      rmSync(stamp, { force: true });
    }
  });

  test("--no-optimize skips the wasm-opt pass", async () => {
    const cwd = path.join(import.meta.dirname, "build/optimize");
    const stamp = path.join(cwd, ".mops/.build/.wasm-opt-ran");
    try {
      const result = await cli(["build", "--no-optimize", "--verbose"], {
        cwd,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout + result.stderr).not.toMatch(/Optimized main\.wasm/);
      expect(existsSync(path.join(cwd, ".mops/.build/main.wasm"))).toBe(true);
      expect(existsSync(stamp)).toBe(false);
    } finally {
      cleanFixture(cwd);
      rmSync(stamp, { force: true });
    }
  });

  test("fatal IC0505 preflight skips PocketIC startup", async () => {
    const cwd = path.join(import.meta.dirname, "build/wasm-complexity");
    const startupMarker = path.join(cwd, "pocket-ic-started");
    try {
      const result = await cli(["build"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch("Error [MOPS-WASM-COMPLEXITY]");
      expect(result.stderr).toMatch(
        /Function: 0[\s\S]*Estimated complexity: 1,000,050[\s\S]*IC0505 limit: 1,000,000[\s\S]*Limit usage: 100\.0%[\s\S]*Instruction count: 20,001/,
      );
      expect(result.stderr).toMatch(
        "Build failed and PocketIC test deployment was skipped",
      );
      expect(result.stdout).not.toMatch("test deploy canister");
      expect(existsSync(startupMarker)).toBe(false);
    } finally {
      cleanFixture(cwd, startupMarker);
    }
  });

  test("count warnings still allow PocketIC deployment", async () => {
    const cwd = path.join(import.meta.dirname, "build/wasm-count-warning");
    try {
      const result = await cliSnapshot(["build", "--test-deploy"], { cwd }, 0);
      expect(result.stderr).toMatch("Warning [MOPS-WASM-SIZE]");
      expect(result.stderr).toMatch("Generated Wasm functions: 650");
      expect(result.stderr).toMatch("do not prove a memory-limit failure");
      expect(result.stdout).toMatch("test deploy canister main");
      expect(result.stdout).toMatch("Built 1 canister successfully");
    } finally {
      cleanFixture(cwd);
    }
  });

  test("[build].test-deploy installs the built Wasm on PocketIC", async () => {
    const cwd = path.join(import.meta.dirname, "build/test-deploy-config");
    try {
      await cliSnapshot(["build"], { cwd }, 0);
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--test-deploy installs the built Wasm on PocketIC", async () => {
    const cwd = path.join(import.meta.dirname, "build/test-deploy");
    try {
      await cliSnapshot(["build", "--test-deploy"], { cwd }, 0);
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--test-deploy accepts a path-pinned PocketIC binary", async () => {
    const versionCwd = path.join(import.meta.dirname, "build/test-deploy");
    const cwd = path.join(import.meta.dirname, "build/test-deploy-path");
    const localBin = path.join(cwd, "pocket-ic");
    try {
      const binResult = await cli(["toolchain", "bin", "pocket-ic"], {
        cwd: versionCwd,
      });
      expect(binResult.exitCode).toBe(0);
      rmSync(localBin, { force: true });
      linkSync(binResult.stdout.trim(), localBin);

      const result = await cli(["build", "--test-deploy"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch("test deploy canister main");
    } finally {
      rmSync(localBin, { force: true });
      cleanFixture(cwd);
    }
  });

  test("build without test-deploy config does not test deployment", async () => {
    const cwd = path.join(import.meta.dirname, "build/test-deploy");
    try {
      const result = await cli(["build"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toMatch("test deploy canister");
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--no-test-deploy overrides [build].test-deploy", async () => {
    const cwd = path.join(import.meta.dirname, "build/test-deploy-config");
    try {
      const result = await cli(["build", "--no-test-deploy"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toMatch("test deploy canister");
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--test-deploy reports Wasm memory limit failures", async () => {
    const cwd = path.join(import.meta.dirname, "build/test-deploy-fail");
    try {
      const result = await cli(["build", "--test-deploy"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch("PocketIC test deployment failed");
      expect(result.stderr).toMatch("Wasm memory limit");
      expect(result.stderr).toMatch(
        "Error code: IC0539 (CanisterWasmMemoryLimitExceeded)",
      );
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--test-deploy reports Candid encoding errors without a deployment label", async () => {
    const cwd = path.join(import.meta.dirname, "build/test-deploy-invalid-arg");
    try {
      const result = await cli(["build", "--test-deploy"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch("Invalid initArg for canister main");
      expect(result.stderr).not.toMatch("PocketIC test deployment failed");
    } finally {
      cleanFixture(cwd);
    }
  });

  test("test-deploy skips a migration chain requiring existing state and deploys its sibling", async () => {
    const cwd = path.join(
      import.meta.dirname,
      "build/test-deploy-incomplete-migrations",
    );
    try {
      const result = await cli(["build"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toMatch(
        "Warning: skipped test deployment for problematic",
      );
      expect(result.stderr).toMatch(
        "enhanced migration chain requires pre-existing state",
      );
      expect(result.stdout).not.toMatch("test deploy canister problematic");
      expect(result.stdout).toMatch("test deploy canister healthy");
      expect(result.stdout).toMatch("Built 2 canisters successfully");
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--test-deploy requires a pinned PocketIC version", async () => {
    const cwd = path.join(import.meta.dirname, "build/success");
    try {
      const result = await cli(["build", "foo", "--test-deploy"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch("mops toolchain use pocket-ic 12.0.0");
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--test-deploy rejects a legacy PocketIC pin before building", async () => {
    const cwd = path.join(import.meta.dirname, "build/test-deploy-legacy");
    const result = await cli(["build", "--test-deploy"], { cwd });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch("requires pocket-ic 9.0.0 or newer");
    // The guard fires before compilation — no build output for this canister.
    expect(result.stdout).not.toMatch("build canister");
  });

  test("rejects an invalid wasmMemoryLimit without --test-deploy", async () => {
    const cwd = path.join(import.meta.dirname, "build/invalid-memory-limit");
    const result = await cli(["build"], { cwd });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(
      "Invalid wasmMemoryLimit for canister main: expected a positive integer number of bytes",
    );
    expect(result.stderr).not.toMatch("PocketIC test deployment failed");
  });

  test("[optimize] soft-fails when wasm-opt errors", async () => {
    const cwd = path.join(import.meta.dirname, "build/optimize-fail");
    try {
      const result = await cli(["build"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stdout + result.stderr).toMatch(
        /Failed to optimize main\.wasm/,
      );
      expect(existsSync(path.join(cwd, ".mops/.build/main.wasm"))).toBe(true);
    } finally {
      cleanFixture(cwd);
    }
  });
});
