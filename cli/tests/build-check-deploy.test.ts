import { describe, expect, jest, test } from "@jest/globals";
import { linkSync, rmSync } from "node:fs";
import path from "path";
import { cleanFixture } from "./build-helpers";
import { cli, cliSnapshot } from "./helpers";

describe("build check-deploy", () => {
  // Several pocket-ic builds per test; slow CI can exceed 60s default.
  jest.setTimeout(120_000);

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

  test("--check-deploy rejects a legacy PocketIC pin", async () => {
    const cwd = path.join(import.meta.dirname, "build/check-deploy-legacy");
    const result = await cli(["build", "--check-deploy"], { cwd });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch("pins below 9.0.0 no longer work");
    expect(result.stdout).toMatch("mops toolchain use pocket-ic 14.0.0");
  });
});
