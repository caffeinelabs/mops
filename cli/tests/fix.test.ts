import { describe, expect, test, beforeAll } from "@jest/globals";
import { execa } from "execa";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const rm = promisify(fs.rm);

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

const MO_VERSION = "1.0.0";
// Enable all warning codes we test
const WARNING_FLAGS = "-W=M0223,M0236,M0237";

/**
 * Creates a temporary file from a source file and ensures cleanup
 */
async function withTmpFile<T>(
  sourceFile: string,
  callback: (tmpFile: string) => Promise<T>,
): Promise<T> {
  const tmpFile = `${sourceFile}.tmp`;
  try {
    // Copy the original source file to temp location
    const originalContent = await readFile(sourceFile, "utf8");
    await writeFile(tmpFile, originalContent);
    return await callback(tmpFile);
  } finally {
    // Clean up temporary file
    await rm(tmpFile, { force: true });
  }
}

/**
 * Gets the moc binary path from toolchain
 */
async function getMocPath(): Promise<string> {
  const mocBinResult = await cli(["toolchain", "bin", "moc"]);
  // Extract just the path, removing npm output prefix
  const lines = mocBinResult.stdout.split("\n");
  const mocPath = lines[lines.length - 1]!.trim();

  if (!mocPath || !fs.existsSync(mocPath)) {
    throw new Error(
      `moc binary not found at ${mocPath}. Toolchain setup may have failed.`,
    );
  }
  return mocPath;
}

function getWarnings(filePath: string, mocPath: string, cwd: string): string[] {
  const output = execSync(
    `"${mocPath}" --check "${filePath}" ${WARNING_FLAGS} 2>&1`,
    { encoding: "utf8", cwd },
  );

  const warnings: string[] = [];

  const warningRegex = /warning \[(M\d+)\]/gi;
  let match;
  while ((match = warningRegex.exec(output)) !== null) {
    warnings.push(match[1]!);
  }

  return warnings;
}

describe("mops fix", () => {
  let mocPath: string;

  beforeAll(async () => {
    // Ensure toolchain is initialized and moc is installed
    const initResult = await cli(["toolchain", "init"]);
    if (
      initResult.exitCode !== 0 &&
      !initResult.stdout.includes("already initialized")
    ) {
      throw new Error(`toolchain init failed: ${initResult.stderr}`);
    }

    const useResult = await cli(["toolchain", "use", "moc", MO_VERSION]);
    if (useResult.exitCode !== 0) {
      throw new Error(`toolchain use failed: ${useResult.stderr}`);
    }

    mocPath = await getMocPath();
  }, 120000);

  const testCases = [
    { code: "M0223", file: "m0223.mo" },
    { code: "M0236", file: "m0236.mo" },
    { code: "M0237", file: "m0237.mo" },
  ];

  for (const { code, file } of testCases) {
    test(`fixes ${code} warning`, async () => {
      const srcFile = path.join(import.meta.dirname, "fix", file);
      const tmpDir = path.dirname(srcFile);

      await withTmpFile(srcFile, async (tmpFile) => {
        // Check initial state - should have the warning
        const beforeWarnings = getWarnings(tmpFile, mocPath, tmpDir);
        expect(beforeWarnings).toContain(code);

        // Run mops fix on the temp file
        const fixResult = await cli(["fix", tmpFile, "--", WARNING_FLAGS]);
        expect(fixResult.exitCode).toBe(0);

        // Verify compilation after fix - should not have warnings or errors
        const afterWarnings = getWarnings(tmpFile, mocPath, tmpDir);
        expect(afterWarnings).toHaveLength(0);
      });
    }, 60000);
  }
});
