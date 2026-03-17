import { describe, expect, test } from "@jest/globals";
import { execa } from "execa";
import { existsSync } from "node:fs";
import path from "path";
import { cliSnapshot } from "./helpers";

const distBin = path.resolve(import.meta.dirname, "../dist/bin/mops.js");

describe("build", () => {
  test("ok", async () => {
    const cwd = path.join(import.meta.dirname, "build/success");
    await cliSnapshot(["build", "--verbose"], { cwd }, 0);
    await cliSnapshot(["build", "foo"], { cwd }, 0);
    await cliSnapshot(["build", "bar"], { cwd }, 0);
    await cliSnapshot(["build", "foo", "bar"], { cwd }, 0);
  });

  test("error", async () => {
    const cwd = path.join(import.meta.dirname, "build/error");
    await cliSnapshot(["build", "foo", "--verbose"], { cwd }, 0);
    expect((await cliSnapshot(["build", "bar"], { cwd }, 1)).stderr).toMatch(
      "Candid compatibility check failed for canister bar",
    );
    expect(
      (await cliSnapshot(["build", "foo", "bar"], { cwd }, 1)).stderr,
    ).toMatch("Candid compatibility check failed for canister bar");
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
      const result = await execa("node", [distBin, "build", "foo"], {
        cwd,
        stdio: "pipe",
        reject: false,
      });

      expect(result.stderr).not.toContain("Wasm bindings have not been set");
      expect(result.exitCode).toBe(0);
    },
  );
});
