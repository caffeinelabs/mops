import { describe, expect, jest, test } from "@jest/globals";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cli } from "./helpers";

// mops.lock is committed, diffed and merged like source, so its key order must
// depend only on content. Targeted assertions, no snapshots (see AGENTS.md).
describe("mops.lock key ordering", () => {
  jest.setTimeout(180_000);

  // Dedicated fixture: Jest runs test files in parallel, so sharing one with
  // another suite would race on mops.lock / .mops.
  const cwd = path.join(import.meta.dirname, "lockfile-ordering");
  const lockFile = path.join(cwd, "mops.lock");
  const tomlFile = path.join(cwd, "mops.toml");
  const originalToml = readFileSync(tomlFile, "utf8");

  const cleanup = () => {
    writeFileSync(tomlFile, originalToml);
    rmSync(lockFile, { force: true });
    rmSync(path.join(cwd, ".mops"), { recursive: true, force: true });
  };

  const install = async (args: string[] = []) =>
    await cli(["install", ...args], { cwd, env: { CI: undefined } });

  const readLock = () => JSON.parse(readFileSync(lockFile, "utf8"));
  const writeLock = (lock: unknown) =>
    writeFileSync(lockFile, JSON.stringify(lock, null, 2));

  // Default sort is code-unit, matching the implementation. Using
  // `localeCompare` here would let a locale-sensitive bug pass.
  const expectSorted = (keys: string[]) =>
    expect(keys).toEqual([...keys].sort());

  // Descending, not `.reverse()`: reversing whatever order the writer happened
  // to produce can land back on sorted, which would silently void the
  // "this really is unsorted" preconditions below.
  const descKeys = <T>(record: Record<string, T>): Record<string, T> =>
    Object.fromEntries(
      Object.entries(record).sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0)),
    );

  const descNested = (record: Record<string, Record<string, string>>) =>
    descKeys(
      Object.fromEntries(
        Object.entries(record).map(([key, inner]) => [key, descKeys(inner)]),
      ),
    );

  test("writes sorted deps, hashes, per-package file keys and graph", async () => {
    cleanup();
    try {
      expect((await install()).exitCode).toBe(0);
      const lock = readLock();

      // mops.toml declares the deps in reverse alphabetical order, so a lock
      // that merely echoed the manifest would fail this.
      expect(Object.keys(lock.deps).length).toBeGreaterThan(1);
      expectSorted(Object.keys(lock.deps));

      expect(Object.keys(lock.hashes).length).toBeGreaterThan(1);
      expectSorted(Object.keys(lock.hashes));

      const perPackage = Object.values(lock.hashes) as Record<string, string>[];
      // At least one package must have several files, or the nested assertion
      // below would be vacuous.
      expect(
        Math.max(...perPackage.map((files) => Object.keys(files).length)),
      ).toBeGreaterThan(1);
      for (const files of perPackage) {
        expectSorted(Object.keys(files));
      }

      expectSorted(Object.keys(lock.graph));
      for (const edges of Object.values(lock.graph) as Record<
        string,
        string
      >[]) {
        expectSorted(Object.keys(edges));
      }

      // Sorting is a serialization detail; the format is unchanged.
      expect(lock.version).toBe(3);
    } finally {
      cleanup();
    }
  });

  // The carry-over path copies an already-locked package's hash record verbatim
  // out of the old lock, so this is the case that a sort applied anywhere but at
  // write time would miss.
  test("sorts per-file hash keys carried over from an existing lock", async () => {
    cleanup();
    try {
      writeFileSync(
        tomlFile,
        '[package]\nname = "lockfile-ordering"\nversion = "1.0.0"\n\n[dependencies]\ncore = "1.0.0"\n',
      );
      expect((await install()).exitCode).toBe(0);

      const lock = readLock();
      lock.hashes["core@1.0.0"] = descKeys(lock.hashes["core@1.0.0"]);
      const scrambled = Object.keys(lock.hashes["core@1.0.0"]);
      expect(scrambled).not.toEqual([...scrambled].sort());
      writeLock(lock);

      // Restoring the second dependency makes the lock legitimately stale, so
      // it gets rewritten and core@1.0.0's hashes are carried over.
      writeFileSync(tomlFile, originalToml);
      expect((await install()).exitCode).toBe(0);

      const rewritten = readLock();
      expectSorted(Object.keys(rewritten.hashes["core@1.0.0"]));
      expectSorted(Object.keys(rewritten.hashes));
      expectSorted(Object.keys(rewritten.deps));
    } finally {
      cleanup();
    }
  });

  test("regenerating an already-sorted lock is byte-identical", async () => {
    cleanup();
    try {
      expect((await install()).exitCode).toBe(0);
      const first = readFileSync(lockFile, "utf8");

      rmSync(lockFile, { force: true });
      expect((await install()).exitCode).toBe(0);
      expect(readFileSync(lockFile, "utf8")).toBe(first);
    } finally {
      cleanup();
    }
  });

  // Key order is irrelevant to every reader, so an unsorted lock committed by an
  // older CLI must keep working. Sorting applies only to what gets written —
  // treating "unsorted" as stale would churn every user's lock on their next
  // install and break --locked on a lock that is otherwise perfectly good.
  test("an unsorted lock stays valid under --locked and is not rewritten", async () => {
    cleanup();
    try {
      expect((await install()).exitCode).toBe(0);

      const lock = readLock();
      lock.deps = descKeys(lock.deps);
      lock.hashes = descNested(lock.hashes);
      if (lock.graph) {
        lock.graph = descNested(lock.graph);
      }
      writeLock(lock);
      const unsorted = readFileSync(lockFile, "utf8");
      expect(Object.keys(readLock().deps)).not.toEqual(
        [...Object.keys(readLock().deps)].sort(),
      );

      const locked = await cli(["install", "--locked"], {
        cwd,
        env: { CI: undefined },
      });
      expect(locked.exitCode).toBe(0);
      expect(readFileSync(lockFile, "utf8")).toBe(unsorted);

      // A plain install must not rewrite it either: being unsorted is not a
      // staleness trigger.
      expect((await install()).exitCode).toBe(0);
      expect(readFileSync(lockFile, "utf8")).toBe(unsorted);
    } finally {
      cleanup();
    }
  });
});
