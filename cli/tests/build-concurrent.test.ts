import { describe, expect, jest, test } from "@jest/globals";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cleanFixture } from "./build-helpers";
import { cli } from "./helpers";

// End-to-end regression for caffeinelabs/mops#818: icp-cli runs one
// `mops build <canister>` per canister concurrently, and on a cold toolchain
// cache every process used to download and extract moc into the same
// directory at once — one build died with `exit code: undefined`, or an
// extraction aborted with `zlib: unexpected end of file`.
describe("concurrent builds on a cold toolchain cache", () => {
  jest.setTimeout(600_000);

  const cwd = path.join(import.meta.dirname, "build/concurrent");
  const canisters = ["a", "b", "c"];

  test("every canister builds and moc is installed once", async () => {
    const cacheHome = await mkdtemp(path.join(os.tmpdir(), "mops-cache-"));
    const env = { XDG_CACHE_HOME: cacheHome };
    const mocDir = path.join(cacheHome, "mops", "moc");

    try {
      // The race is timing-dependent: before the fix one cold round failed
      // roughly every other run, so two rounds keep the regression visible.
      for (let round = 0; round < 2; round++) {
        rmSync(cacheHome, { recursive: true, force: true });
        cleanFixture(cwd, path.join(cwd, "mops.lock"));

        const results = await Promise.all(
          canisters.map((name) => cli(["build", name], { cwd, env })),
        );

        for (const [i, result] of results.entries()) {
          expect({
            round,
            canister: canisters[i],
            exitCode: result.exitCode,
            stderr: result.stderr,
          }).toEqual({
            round,
            canister: canisters[i],
            exitCode: 0,
            stderr: expect.not.stringMatching(
              /Build failed|ZlibError|TAR_ABORT|Unknown system error/,
            ),
          });
          expect(
            existsSync(path.join(cwd, ".mops/.build", `${canisters[i]}.wasm`)),
          ).toBe(true);
        }

        // one complete version dir, no staging or lock leftovers
        expect(readdirSync(mocDir)).toEqual(["1.3.0"]);
        expect(existsSync(path.join(mocDir, "1.3.0", "moc"))).toBe(true);
      }
    } finally {
      cleanFixture(cwd, path.join(cwd, "mops.lock"));
      rmSync(cacheHome, { recursive: true, force: true });
    }
  });
});
