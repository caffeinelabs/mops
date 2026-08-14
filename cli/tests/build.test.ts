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

  test("over-limit IC0505 estimate continues to PocketIC", async () => {
    const cwd = path.join(import.meta.dirname, "build/wasm-complexity");
    try {
      const result = await cli(["build"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch("Warning [MOPS-WASM-COMPLEXITY]");
      expect(result.stderr).toMatch(
        /Function: 0[\s\S]*Estimated complexity: 1,000,050[\s\S]*IC0505 limit: 1,000,000[\s\S]*Limit usage: 100\.0%[\s\S]*Instruction count: 20,001/,
      );
      expect(result.stderr).toMatch(
        "Run `mops build --check-deploy` for authoritative PocketIC validation",
      );
      expect(result.stderr).toMatch("Error code: CanisterInvalidWasm");
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--check-wasm analyzes Wasm without starting PocketIC", async () => {
    const cwd = path.join(import.meta.dirname, "build/check-wasm-flag");
    try {
      const result = await cli(["build", "--check-wasm"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toMatch("Warning [MOPS-WASM-COMPLEXITY]");
      expect(result.stdout).not.toMatch("check deploy canister");
      expect(result.stdout).toMatch("Built 1 canister successfully");
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--no-check-deploy leaves configured Wasm analysis enabled", async () => {
    const cwd = path.join(import.meta.dirname, "build/wasm-complexity");
    try {
      const result = await cli(["build", "--no-check-deploy"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toMatch("Warning [MOPS-WASM-COMPLEXITY]");
      expect(result.stdout).not.toMatch("check deploy canister");
      expect(result.stdout).toMatch("Built 1 canister successfully");
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--no-check-wasm leaves configured PocketIC validation enabled", async () => {
    const cwd = path.join(import.meta.dirname, "build/wasm-complexity");
    try {
      const result = await cli(["build", "--no-check-wasm"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).not.toMatch("MOPS-WASM-COMPLEXITY");
      expect(result.stderr).toMatch("Error code: CanisterInvalidWasm");
      expect(result.stdout).toMatch("check deploy canister main");
    } finally {
      cleanFixture(cwd);
    }
  });

  test("[build].check-deploy installs the built Wasm on PocketIC", async () => {
    const cwd = path.join(import.meta.dirname, "build/check-deploy-config");
    try {
      await cliSnapshot(["build"], { cwd }, 0);
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--check-deploy installs the built Wasm on PocketIC", async () => {
    const cwd = path.join(import.meta.dirname, "build/check-deploy");
    try {
      await cliSnapshot(["build", "--check-deploy"], { cwd }, 0);
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--check-deploy accepts a path-pinned PocketIC binary", async () => {
    const versionCwd = path.join(import.meta.dirname, "build/check-deploy");
    const cwd = path.join(import.meta.dirname, "build/check-deploy-path");
    const localBin = path.join(cwd, "pocket-ic");
    try {
      const binResult = await cli(["toolchain", "bin", "pocket-ic"], {
        cwd: versionCwd,
      });
      expect(binResult.exitCode).toBe(0);
      rmSync(localBin, { force: true });
      linkSync(binResult.stdout.trim(), localBin);

      const result = await cli(["build", "--check-deploy"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch("check deploy canister main");
    } finally {
      rmSync(localBin, { force: true });
      cleanFixture(cwd);
    }
  });

  test("build without check-deploy config does not check deployment", async () => {
    const cwd = path.join(import.meta.dirname, "build/check-deploy");
    try {
      const result = await cli(["build"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toMatch("check deploy canister");
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--no-check-deploy overrides [build].check-deploy", async () => {
    const cwd = path.join(import.meta.dirname, "build/check-deploy-config");
    try {
      const result = await cli(["build", "--no-check-deploy"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toMatch("check deploy canister");
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--check-deploy reports Wasm memory limit failures", async () => {
    const cwd = path.join(import.meta.dirname, "build/check-deploy-fail");
    try {
      const result = await cli(["build", "--check-deploy"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch("PocketIC deployment check failed");
      expect(result.stderr).toMatch("Wasm memory limit");
      expect(result.stderr).toMatch(
        "Error code: CanisterWasmMemoryLimitExceeded",
      );
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--check-deploy reports Candid encoding errors without a deployment label", async () => {
    const cwd = path.join(
      import.meta.dirname,
      "build/check-deploy-invalid-arg",
    );
    try {
      const result = await cli(["build", "--check-deploy"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch("Invalid initArg for canister main");
      expect(result.stderr).not.toMatch("PocketIC deployment check failed");
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--check-deploy preserves an ordinary installation failure", async () => {
    const cwd = path.join(import.meta.dirname, "build/check-deploy-trap");
    try {
      const result = await cli(["build", "--check-deploy"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch("PocketIC deployment check failed");
      expect(result.stderr).toMatch("assertion failed");
      expect(result.stderr).toMatch("Error code: CanisterCalledTrap");
      expect(result.stderr).not.toMatch("MOPS-CHECK-DEPLOY-SKIPPED");
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--check-deploy preserves PocketIC startup failures", async () => {
    const cwd = path.join(
      import.meta.dirname,
      "build/check-deploy-startup-fail",
    );
    try {
      const result = await cli(["build", "--check-deploy"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch("PocketIC deployment check failed");
      expect(result.stdout).not.toMatch("check deploy canister");
    } finally {
      cleanFixture(cwd);
    }
  });

  test("check-deploy skips chains incompatible with empty state and checks siblings", async () => {
    const cwd = path.join(
      import.meta.dirname,
      "build/check-deploy-incomplete-migrations",
    );
    try {
      const result = await cli(["build"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toMatch("Warning [MOPS-CHECK-DEPLOY-SKIPPED]");
      expect(result.stderr).toMatch("Canister: problematic");
      expect(result.stderr).toMatch("Canister: problematic2");
      expect(
        result.stderr.match(/Fresh PocketIC deployment check did not run\./g),
      ).toHaveLength(2);
      expect(result.stderr).toMatch(
        "moc reported that the generated stable state is incompatible with an empty canister",
      );
      expect(result.stderr).toMatch("Compatibility error");
      expect(result.stdout).not.toMatch("check deploy canister problematic");
      expect(result.stdout).not.toMatch("check deploy canister problematic2");
      expect(result.stdout).toMatch("check deploy canister healthy");
      expect(result.stdout).toMatch("check deploy canister aliased");
      expect(result.stdout).toMatch("Built 4 canisters successfully");
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--check-deploy requires a pinned PocketIC version", async () => {
    const cwd = path.join(import.meta.dirname, "build/success");
    try {
      const result = await cli(["build", "foo", "--check-deploy"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch("mops toolchain use pocket-ic 15.0.0");
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--check-deploy with MOPS_POCKET_IC_URL does not require a pin", async () => {
    const cwd = path.join(import.meta.dirname, "build/success");
    try {
      const result = await cli(["build", "foo", "--check-deploy"], {
        cwd,
        env: { MOPS_POCKET_IC_URL: "http://127.0.0.1:1" },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).not.toMatch("mops toolchain use pocket-ic");
      expect(result.stderr).toMatch("PocketIC deployment check failed");
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--check-deploy rejects a non-http MOPS_POCKET_IC_URL", async () => {
    const cwd = path.join(import.meta.dirname, "build/success");
    try {
      const result = await cli(["build", "foo", "--check-deploy"], {
        cwd,
        env: { MOPS_POCKET_IC_URL: "ftp://example.com" },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch("must be an http or https URL");
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--check-deploy warns when MOPS_POCKET_IC_URL ignores a pin", async () => {
    const cwd = path.join(import.meta.dirname, "build/check-deploy");
    try {
      const result = await cli(["build", "--check-deploy"], {
        cwd,
        env: { MOPS_POCKET_IC_URL: "http://127.0.0.1:1" },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stdout + result.stderr).toMatch("MOPS_POCKET_IC_URL");
      expect(result.stdout + result.stderr).toMatch("ignored");
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--check-deploy rejects a legacy PocketIC pin before building", async () => {
    const cwd = path.join(import.meta.dirname, "build/check-deploy-legacy");
    const result = await cli(["build", "--check-deploy"], { cwd });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch("requires pocket-ic 9.0.0 or newer");
    // The guard fires before compilation — no build output for this canister.
    expect(result.stdout).not.toMatch("build canister");
  });

  test("rejects an invalid wasmMemoryLimit without --check-deploy", async () => {
    const cwd = path.join(import.meta.dirname, "build/invalid-memory-limit");
    const result = await cli(["build"], { cwd });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(
      "Invalid wasmMemoryLimit for canister main: expected a positive integer number of bytes",
    );
    expect(result.stderr).not.toMatch("PocketIC deployment check failed");
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
