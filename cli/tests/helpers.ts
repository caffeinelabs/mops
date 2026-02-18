import { expect } from "@jest/globals";
import { execa } from "execa";
import { dirname } from "path";
import { fileURLToPath } from "url";

export interface CliOptions {
  cwd?: string;
}

export const cli = async (args: string[], { cwd }: CliOptions = {}) => {
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

export const cliSnapshot = async (
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
