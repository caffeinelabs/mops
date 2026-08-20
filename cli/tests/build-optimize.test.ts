import { describe, expect, jest, test } from "@jest/globals";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "path";
import { cleanFixture } from "./build-helpers";
import { cli } from "./helpers";

describe("build optimize", () => {
  // Several builds per test; slow CI can exceed 60s default.
  jest.setTimeout(120_000);

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

  test("[optimize] fails the build when wasm-opt errors", async () => {
    const cwd = path.join(import.meta.dirname, "build/optimize-fail");
    try {
      const result = await cli(["build"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/Failed to optimize main\.wasm/);
      expect(result.stderr).toMatch("mock-wasm-opt: intentional failure");
    } finally {
      cleanFixture(cwd);
    }
  });

  test("[optimize] without a wasm-opt pin errors instead of pinning one", async () => {
    const cwd = path.join(import.meta.dirname, "build/optimize-unpinned");
    const manifest = path.join(cwd, "mops.toml");
    const before = readFileSync(manifest, "utf8");
    try {
      const result = await cli(["build"], { cwd });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch("wasm-opt is not pinned");
      expect(result.stderr).toMatch("mops toolchain use wasm-opt 131");
      // The build must not rewrite the manifest it was handed.
      expect(readFileSync(manifest, "utf8")).toBe(before);
      // ...and must fail before compiling anything.
      expect(existsSync(path.join(cwd, ".mops/.build/main.wasm"))).toBe(false);
    } finally {
      cleanFixture(cwd);
    }
  });

  test("--no-optimize builds despite an unpinned wasm-opt", async () => {
    const cwd = path.join(import.meta.dirname, "build/optimize-unpinned");
    try {
      const result = await cli(["build", "--no-optimize"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(existsSync(path.join(cwd, ".mops/.build/main.wasm"))).toBe(true);
    } finally {
      cleanFixture(cwd);
    }
  });
});
