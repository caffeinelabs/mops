import { describe, expect, jest, test } from "@jest/globals";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "path";
import { cleanFixture } from "./build-helpers";
import { cli, cliSnapshot } from "./helpers";

// Unstable `[build] manifest` feature — <canister>.build.json records next to
// the built artifacts. Split out of build.test.ts like the other build
// concerns so no single file becomes the tail of the jest run.
describe("build manifest", () => {
  jest.setTimeout(120_000);

  test("[build] manifest = true writes a record per canister", async () => {
    const cwd = path.join(import.meta.dirname, "build/manifest");
    const outDir = path.join(cwd, ".mops/.build");
    try {
      await cliSnapshot(["build", "--verbose"], { cwd }, 0);

      const readManifest = (name: string) =>
        JSON.parse(
          readFileSync(path.join(outDir, `${name}.build.json`), "utf-8"),
        );

      const fresh = readManifest("fresh");
      expect(fresh.version).toBe(1);
      expect(fresh.canister).toBe("fresh");
      expect(fresh.moc).toBe("1.5.0");

      // Hashes must describe the artifacts as finally written (after metadata
      // embedding), so recompute rather than snapshot moc-version-bound hex.
      for (const kind of ["wasm", "did", "most"] as const) {
        const output = fresh.outputs[kind];
        expect(output.path).toBe(`fresh.${kind}`);
        const bytes = readFileSync(path.join(outDir, output.path));
        expect(output.sha256).toBe(
          createHash("sha256").update(bytes).digest("hex"),
        );
      }

      expect(fresh.checks).toEqual([
        { name: "stable-compatibility", baseline: "empty", passed: true },
      ]);

      // A migration requiring pre-existing state is recorded as upgrade-only,
      // without failing the build.
      const upgradeOnly = readManifest("upgrade-only");
      expect(upgradeOnly.checks).toEqual([
        { name: "stable-compatibility", baseline: "empty", passed: false },
      ]);

      const manifests = readdirSync(outDir).filter((f) =>
        f.endsWith(".build.json"),
      );
      expect(manifests.sort()).toEqual([
        "fresh.build.json",
        "upgrade-only.build.json",
      ]);

      // Off by default, and a rebuild without the flag removes stale records
      // so a manifest never outlives the artifacts it describes.
      const tomlPath = path.join(cwd, "mops.toml");
      const toml = readFileSync(tomlPath, "utf-8");
      try {
        writeFileSync(tomlPath, toml.replace("manifest = true\n", ""));
        expect((await cli(["build", "fresh"], { cwd })).exitCode).toBe(0);
        expect(existsSync(path.join(outDir, "fresh.build.json"))).toBe(false);
      } finally {
        writeFileSync(tomlPath, toml);
      }
    } finally {
      cleanFixture(cwd, path.join(cwd, "mops.lock"));
    }
  });
});
