import { afterEach, describe, expect, test } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { useTempFixtures } from "./helpers";
import { cli } from "./helpers";

// A `test/lib.mo` short-circuits discovery — it becomes the only file run. It
// was the one glob left unfiltered, so a nested copy's `lib.mo` hijacked the
// run and the project's own tests never executed.
describe("test lib.mo discovery", () => {
  const makeTempFixture = useTempFixtures(
    path.join(import.meta.dirname, "test-lib-nested"),
  );

  // A linked worktree's `.git` is a file, which cannot be committed — add the
  // marker to the scratch copy.
  const makeProject = async () => {
    let cwd = await makeTempFixture("nested-lib");
    fs.writeFileSync(path.join(cwd, "worktree/.git"), "gitdir: /elsewhere\n");
    return cwd;
  };

  afterEach(() => {
    // Nothing outside the fixture dir; `useTempFixtures` cleans the rest.
  });

  test("a nested worktree's lib.mo does not hijack the run", async () => {
    let cwd = await makeProject();
    let result = await cli(["test"], { cwd });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/own ran/);
    expect(result.stdout).not.toMatch(/copy ran/);
  });

  test("the project's own lib.mo still short-circuits", async () => {
    let cwd = await makeProject();
    fs.writeFileSync(
      path.join(cwd, "test/lib.mo"),
      'import Prim "mo:prim";\nPrim.debugPrint("own lib ran");\nassert 1 == 1;\n',
    );
    let result = await cli(["test"], { cwd });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/own lib ran/);
    expect(result.stdout).not.toMatch(/copy ran/);
  });
});
