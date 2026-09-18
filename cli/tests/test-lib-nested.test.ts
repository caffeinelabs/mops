import { describe, expect, test } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { useTempFixtures } from "./helpers";
import { cli } from "./helpers";

// A `test/lib.mo` short-circuits discovery — it becomes the only file run. It
// was the one glob left unfiltered, so a nested copy's `lib.mo` hijacked the
// run and the project's own tests never executed.
//
// Both markers are written per-test rather than committed: a `.git` file cannot
// be stored in git, and a committed `lib.mo` under a `test/` directory would
// itself short-circuit this repo's own `mops test` at the root.
describe("test lib.mo discovery", () => {
  const makeTempFixture = useTempFixtures(
    path.join(import.meta.dirname, "test-lib-nested"),
  );

  const makeProject = async ({ ownLib }: { ownLib: boolean }) => {
    let cwd = await makeTempFixture("nested-lib");
    fs.mkdirSync(path.join(cwd, "worktree/test"), { recursive: true });
    fs.writeFileSync(path.join(cwd, "worktree/.git"), "gitdir: /elsewhere\n");
    fs.writeFileSync(
      path.join(cwd, "worktree/test/lib.mo"),
      'import Prim "mo:prim";\nPrim.debugPrint("copy ran");\nassert 1 == 1;\n',
    );
    if (ownLib) {
      fs.writeFileSync(
        path.join(cwd, "test/lib.mo"),
        'import Prim "mo:prim";\nPrim.debugPrint("own lib ran");\nassert 1 == 1;\n',
      );
    }
    return cwd;
  };

  test("a nested worktree's lib.mo does not hijack the run", async () => {
    let cwd = await makeProject({ ownLib: false });
    let result = await cli(["test"], { cwd });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/own ran/);
    expect(result.stdout).not.toMatch(/copy ran/);
  });

  test("the project's own lib.mo still short-circuits", async () => {
    let cwd = await makeProject({ ownLib: true });
    let result = await cli(["test"], { cwd });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/own lib ran/);
    expect(result.stdout).not.toMatch(/copy ran/);
  });
});
