import { describe, expect, test } from "@jest/globals";
import { execa } from "execa";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

interface CliOptions {
  cwd?: string;
}

const cli = async (args: string[], { cwd }: CliOptions = {}) => {
  return await execa("npm", ["run", "--silent", "mops", "--", ...args], {
    env: { ...process.env, ...(cwd != null && { MOPS_CWD: cwd }) },
    ...(cwd != null && { cwd }),
    stdio: "pipe",
    reject: false,
  });
};

// Strip ANSI escape codes for portable snapshots (avoid control char in regex literal)
const stripAnsi = (s: string) =>
  s.replace(new RegExp(`\u001b\\[[0-9;]*m`, "g"), "");

const normalizePaths = (text: string): string => {
  // Replace absolute paths with placeholders for CI
  return stripAnsi(
    text
      .replaceAll(dirname(fileURLToPath(import.meta.url)), "<TEST_DIR>")
      .replace(/\/[^\s"]+\/\.cache\/mops/g, "<CACHE>")
      .replace(/\/[^\s"]+\/Library\/Caches\/mops/g, "<CACHE>")
      .replace(/\/[^\s"[\]]+\/moc(?:-wrapper)?(?=\s|$)/g, "moc-wrapper")
      .replace(/\/[^\s"[\]]+\.motoko\/bin\/moc/g, "moc-wrapper"),
  );
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
    stdout: normalizePaths(result.stdout),
    stderr: normalizePaths(result.stderr),
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
    await cliSnapshot(["build", "--verbose"], { cwd }, 0);
    await cliSnapshot(["build", "foo"], { cwd }, 0);
    await cliSnapshot(["build", "bar"], { cwd }, 0);
    await cliSnapshot(["build", "foo", "bar"], { cwd }, 0);
  });

  test("build error", async () => {
    const cwd = path.join(import.meta.dirname, "build/error");
    await cliSnapshot(["build", "foo", "--verbose"], { cwd }, 0);
    expect((await cliSnapshot(["build", "bar"], { cwd }, 1)).stderr).toMatch(
      "Candid compatibility check failed for canister bar",
    );
    expect(
      (await cliSnapshot(["build", "foo", "bar"], { cwd }, 1)).stderr,
    ).toMatch("Candid compatibility check failed for canister bar");
  });

  test("check success", async () => {
    const cwd = path.join(import.meta.dirname, "check/success");
    await cliSnapshot(["check", "Valid.mo"], { cwd }, 0);
    await cliSnapshot(["check", "Valid.mo", "--verbose"], { cwd }, 0);
  });

  test("check error", async () => {
    const cwd = path.join(import.meta.dirname, "check/error");
    await cliSnapshot(["check", "Invalid.mo"], { cwd }, 1);
    await cliSnapshot(["check", "Valid.mo", "Invalid.mo"], { cwd }, 1);
  });

  test("check --fix M0223", async () => {
    const cwd = path.join(import.meta.dirname, "check/fix");
    const result = await cli(["check", "M0223.mo", "--fix"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBeTruthy();
  });

  test("check --fix M0236", async () => {
    const cwd = path.join(import.meta.dirname, "check/fix");
    const result = await cli(["check", "M0236.mo", "--fix"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBeTruthy();
  });

  test("check --fix M0237", async () => {
    const cwd = path.join(import.meta.dirname, "check/fix");
    const result = await cli(["check", "M0237.mo", "--fix"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBeTruthy();
  });

  test("check --fix verbose", async () => {
    const cwd = path.join(import.meta.dirname, "check/fix");
    const result = await cli(["check", "Valid.mo", "--fix", "--verbose"], {
      cwd,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBeTruthy();
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

  test("lint", async () => {
    const cwd = path.join(import.meta.dirname, "lint");
    await cliSnapshot(["lint", "--verbose"], { cwd }, 1);
    await cliSnapshot(["lint", "Valid", "--verbose"], { cwd }, 0);
    await cliSnapshot(["lint", "NoBoolSwitch", "--verbose"], { cwd }, 1);
    await cliSnapshot(["lint", "DoesNotExist"], { cwd }, 1);
  });

  test("toolchain file URI", async () => {
    const cwd = path.join(import.meta.dirname, "toolchain");
    const result = await cli(["toolchain", "bin", "moc"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("./mock");
  });
});
