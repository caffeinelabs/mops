import { describe, expect, jest, test } from "@jest/globals";
import path from "path";
import { cleanFixture } from "./build-helpers";
import { cli } from "./helpers";

describe("build check-wasm", () => {
  // Several pocket-ic builds per test; slow CI can exceed 60s default.
  jest.setTimeout(120_000);

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

  test("rejects an invalid wasmMemoryLimit without --check-deploy", async () => {
    const cwd = path.join(import.meta.dirname, "build/invalid-memory-limit");
    const result = await cli(["build"], { cwd });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(
      "Invalid wasmMemoryLimit for canister main: expected a positive integer number of bytes",
    );
    expect(result.stderr).not.toMatch("PocketIC deployment check failed");
  });
});
