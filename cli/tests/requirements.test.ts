import { describe, expect, test, beforeEach, afterEach } from "@jest/globals";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "path";
import { bytesToHex } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { cli } from "./helpers";

describe("requirements", () => {
  const fixtureDir = path.join(import.meta.dirname, "requirements-lintoko");
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(
      import.meta.dirname,
      `_tmp_requirements_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    );
    await cp(fixtureDir, tempDir, { recursive: true });

    const depDir = path.join(tempDir, ".mops", "my-pkg@0.1.0");
    await mkdir(depDir, { recursive: true });
    await writeFile(
      path.join(depDir, "mops.toml"),
      `[package]
name = "my-pkg"
version = "0.1.0"

[requirements]
lintoko = "0.10.0"
`,
    );

    const mopsTomlDepsHash = bytesToHex(
      sha256(JSON.stringify({ "my-pkg": "0.1.0" })),
    );
    await writeFile(
      path.join(tempDir, "mops.lock"),
      JSON.stringify({
        version: 3,
        mopsTomlDepsHash,
        deps: { "my-pkg": "0.1.0" },
        hashes: {
          "my-pkg@0.1.0": {
            "mops.toml":
              "0000000000000000000000000000000000000000000000000000000000000000",
          },
        },
      }),
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("lintoko requirement warns when installed version is too old", async () => {
    const result = await cli(["toolchain", "use", "lintoko", "0.7.0"], {
      cwd: tempDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(
      /lintoko version does not meet the requirements of my-pkg@0\.1\.0/,
    );
    expect(result.stdout).toMatch(/Required: >= 0\.10\.0/);
    expect(result.stdout).toMatch(/Installed:\s+0\.7\.0/);
  });
});
