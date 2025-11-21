import { describe, expect, test } from "@jest/globals";
import { execa } from "execa";
import path from "path";

interface CliOptions {
  cwd?: string;
}

const cli = async (args: string[], { cwd }: CliOptions = {}) => {
  return await execa("npm", ["run", "mops", "--", ...args], {
    env: { MOPS_CWD: cwd },
    stdio: "pipe",
    reject: false,
  });
};

const cliSnapshot = async (
  args: string[],
  options: CliOptions,
  exitCode: number,
) => {
  const result = await cli(args, options);
  expect({
    command: result.command,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    stdio: Boolean(result.stdout || result.stderr),
  }).toEqual({
    command: result.command,
    exitCode,
    timedOut: false,
    stdio: true,
  });
  expect({
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  }).toMatchSnapshot();
  return result;
};

describe("mops", () => {
  test("version", async () => {
    expect((await cli(["--version"])).stdout).toMatch(/CLI \d+\.\d+\.\d+/);
  });

  test("help", async () => {
    expect((await cli(["--help"])).stdout).toMatch(/^Usage: mops/m);
  });

  test("build success", async () => {
    const cwd = path.join(import.meta.dirname, "build/success");
    await cliSnapshot(["build"], { cwd }, 0);
    await cliSnapshot(["build", "foo"], { cwd }, 0);
    await cliSnapshot(["build", "bar"], { cwd }, 0);
    await cliSnapshot(["build", "foo", "bar"], { cwd }, 0);
  });

  test("build error", async () => {
    const cwd = path.join(import.meta.dirname, "build/error");
    await cliSnapshot(["build", "foo"], { cwd }, 0);
    expect((await cliSnapshot(["build", "bar"], { cwd }, 1)).stderr).toMatch(
      "Candid compatibility check failed for canister bar",
    );
    expect(
      (await cliSnapshot(["build", "foo", "bar"], { cwd }, 1)).stderr,
    ).toMatch("Candid compatibility check failed for canister bar");
  });

  test("check-candid", async () => {
    const cwd = path.join(import.meta.dirname, "check-candid");
    await cliSnapshot(["check-candid", "a.did", "a.did"], { cwd }, 0);
    await cliSnapshot(["check-candid", "b.did", "b.did"], { cwd }, 0);
    await cliSnapshot(["check-candid", "c.did", "c.did"], { cwd }, 0);
    await cliSnapshot(["check-candid", "a.did", "b.did"], { cwd }, 0);
    await cliSnapshot(["check-candid", "b.did", "a.did"], { cwd }, 0);
    await cliSnapshot(["check-candid", "a.did", "c.did"], { cwd }, 1);
    await cliSnapshot(["check-candid", "c.did", "a.did"], { cwd }, 1);
    await cliSnapshot(["check-candid", "b.did", "c.did"], { cwd }, 1);
    await cliSnapshot(["check-candid", "c.did", "b.did"], { cwd }, 1);
  });
});
