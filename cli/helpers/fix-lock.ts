import chalk from "chalk";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lock, unlockSync } from "proper-lockfile";
import { getRootDir } from "../mops.js";

// Serializes Motoko-source-writing commands (`check --fix`, `lint --fix`)
// across concurrent `mops` invocations in the same project. Two parallel
// `--fix` runs can otherwise apply stale moc byte offsets to a sibling's
// already-mutated file, corrupting source. Cargo-style: print a wait
// message after the first failed acquire, then retry with backoff.
//
// Re-entrant within a single process so `mops check --fix` (which calls
// `mops lint --fix` internally) doesn't deadlock against itself.

let depth = 0;

export async function withFixLock<T>(fn: () => Promise<T>): Promise<T> {
  if (depth > 0) {
    depth++;
    try {
      return await fn();
    } finally {
      depth--;
    }
  }

  const rootDir = getRootDir();
  if (!rootDir) {
    return fn();
  }

  const lockDir = join(rootDir, ".mops");
  await mkdir(lockDir, { recursive: true });
  const lockTarget = join(lockDir, "fix.lock");
  await writeFile(lockTarget, "", { flag: "a" });

  const stale = 300_000;
  let release: () => Promise<void>;
  try {
    release = await lock(lockTarget, { stale, retries: 0 });
  } catch (err: any) {
    if (err?.code !== "ELOCKED") {
      throw err;
    }
    console.log(
      chalk.gray("Waiting for another `mops --fix` run to finish..."),
    );
    try {
      release = await lock(lockTarget, {
        stale,
        retries: { retries: 240, minTimeout: 250, maxTimeout: 2_000 },
      });
    } catch (err2: any) {
      throw new Error(
        `Failed to acquire mops fix lock at ${lockTarget} — another --fix process may be stuck. Remove the file to recover.${err2?.message ? `\n${err2.message}` : ""}`,
      );
    }
  }

  // proper-lockfile registers its own signal-exit handler, but it doesn't reliably
  // fire on process.exit(). This manual handler covers that gap. Double-unlock is
  // harmless (the second call throws and is caught).
  const exitCleanup = () => {
    try {
      unlockSync(lockTarget);
    } catch {}
  };
  process.on("exit", exitCleanup);

  depth = 1;
  try {
    return await fn();
  } finally {
    depth = 0;
    process.removeListener("exit", exitCleanup);
    try {
      await release();
    } catch {}
  }
}
