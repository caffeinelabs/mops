import { beforeAll, describe, test } from "@jest/globals";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "path";
import { cliSnapshot } from "./helpers";

// A `dfx` on PATH that fails the way a missing one does. mops must never invoke
// it, so shadowing the real one has to make no difference.
let env: Record<string, string> = {};

beforeAll(async () => {
  const stubDir = await mkdtemp(path.join(tmpdir(), "mops-no-dfx-"));
  const stub = path.join(stubDir, "dfx");
  await writeFile(
    stub,
    '#!/bin/sh\necho "dfx: command not found" >&2\nexit 127\n',
  );
  await chmod(stub, 0o755);
  env = { PATH: `${stubDir}:${process.env.PATH}` };
});

describe("without dfx", () => {
  const cwd = path.join(import.meta.dirname, "build/no-dfx");

  test("builds using mops toolchain moc", async () => {
    await cliSnapshot(["build"], { cwd, env }, 0);
  }, 120_000);

  test("checks using mops toolchain moc", async () => {
    await cliSnapshot(["check"], { cwd, env }, 0);
  }, 120_000);
});
