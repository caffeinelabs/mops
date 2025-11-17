import chalk from "chalk";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { is_candid_compatible } from "../wasm.js";

export interface CheckCandidOptions {
  verbose?: boolean;
}

export async function checkCandid(
  newPath: string,
  originalPath: string,
  options: Partial<CheckCandidOptions> = {},
): Promise<void> {
  const { verbose = false } = options;

  if (!existsSync(newPath)) {
    throw new Error(`New Candid file not found: ${newPath}`);
  }
  if (!existsSync(originalPath)) {
    throw new Error(`Original Candid file not found: ${originalPath}`);
  }

  const resolvedNewCandidPath = path.resolve(newPath);
  const resolvedOriginalCandidPath = path.resolve(originalPath);

  console.log(chalk.blue("Checking Candid compatibility"));
  console.log(chalk.gray(`New Candid file: ${resolvedNewCandidPath}`));
  console.log(
    chalk.gray(`Original Candid file: ${resolvedOriginalCandidPath}`),
  );

  try {
    verbose && console.time("check-candid");

    const newText = readFileSync(resolvedNewCandidPath, "utf8");
    const originalText = readFileSync(resolvedOriginalCandidPath, "utf8");

    if (verbose) {
      console.log(
        chalk.gray(
          `Comparing Candid interfaces using Wasm compatibility checker`,
        ),
      );
    }

    const result = is_candid_compatible(newText, originalText);
    if (!result) {
      console.error(chalk.red("✖ Candid compatibility check failed"));
      process.exit(1);
    }

    console.log(chalk.green("✓ Candid compatibility check passed"));

    verbose && console.timeEnd("check-candid");
  } catch (error: any) {
    console.error(chalk.red("Error while checking Candid compatibility"));

    if (error.message) {
      console.error(chalk.red(`Details: ${error.message}`));
    }

    throw new Error("Candid compatibility check execution failed");
  }
}
