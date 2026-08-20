import { rmSync } from "node:fs";
import path from "path";

/**
 * Remove a build fixture's `.mops` directory, plus any extra paths a test
 * created outside it (custom output dirs, stray artifacts, lockfiles).
 *
 * Shared by the `build*.test.ts` suites, which are split by concern so that no
 * single file becomes the tail of the whole jest run.
 */
export function cleanFixture(cwd: string, ...extras: string[]) {
  rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
  for (const p of extras) {
    rmSync(p, { recursive: true, force: true });
  }
}
