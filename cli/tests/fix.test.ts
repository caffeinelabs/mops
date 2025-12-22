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
const SRC_FILE = path.join(import.meta.dirname, "fix/m0236.mo");

describe("mops fix", () => {
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
  }, 120000);

  test("fixes M0236 warning", async () => {
    // Create a temporary file by adding .tmp to the source file name
    const tmpFile = `${SRC_FILE}.tmp`;

    // Copy the original source file to temp location
    const originalContent = await readFile(SRC_FILE, "utf8");
    await writeFile(tmpFile, originalContent);

    // Get moc path via toolchain
    const mocBinResult = await cli(["toolchain", "bin", "moc"]);
    // Extract just the path, removing npm output prefix
    const lines = mocBinResult.stdout.split("\n");
    const mocPath = lines[lines.length - 1]!.trim();

    if (!mocPath || !fs.existsSync(mocPath)) {
      throw new Error(
        `moc binary not found at ${mocPath}. Toolchain setup may have failed.`,
      );
    }

    // Check initial state - should have M0236 warning
    let hasWarning = false;
    const tmpDir = path.dirname(SRC_FILE);
    try {
      const checkResult = execSync(
        `"${mocPath}" --check "${tmpFile}" -W M0236 2>&1`,
        { encoding: "utf8", cwd: tmpDir },
      );
      hasWarning = checkResult.includes("M0236");
    } catch (e: any) {
      // If execSync throws, check stderr/stdout
      const output = (e.stdout || e.stderr || e.message || "").toString();
      hasWarning = output.includes("M0236");
    }
    expect(hasWarning).toBe(true);

    // Run mops fix on the temp file
    const fixResult = await cli(["fix", tmpFile]);
    expect(fixResult.exitCode).toBe(0);

    // Verify file content changed
    const content = await readFile(tmpFile, "utf8");
    expect(content).toContain("peopleMap.size()");
    expect(content).not.toContain("Map.size(peopleMap)");

    // Verify compilation after fix - should not have M0236 warning
    try {
      const postCheckResult = execSync(
        `"${mocPath}" --check "${tmpFile}" -W M0236 2>&1`,
        { encoding: "utf8", cwd: tmpDir },
      );
      expect(postCheckResult).not.toContain("M0236");
      // Should compile without errors
      expect(postCheckResult).not.toMatch(/error/i);
    } catch (e: any) {
      const output = e.stdout || e.stderr || e.message || "";
      expect(output).not.toContain("M0236");
      // If there are errors, they should not be related to our fix
      if (output.toLowerCase().includes("error")) {
        throw new Error(`Compilation failed after fix: ${output}`);
      }
    } finally {
      // Clean up temporary file
      await rm(tmpFile, { force: true });
    }
  }, 60000);
});
