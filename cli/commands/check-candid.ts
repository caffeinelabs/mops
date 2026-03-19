import chalk from "chalk";
import { isCandidCompatible } from "../helpers/is-candid-compatible.js";
import { cliError } from "../error.js";

export interface CheckCandidOptions {
  verbose?: boolean;
}

export async function checkCandid(
  newPath: string,
  originalPath: string,
): Promise<void> {
  try {
    const compatible = await isCandidCompatible(newPath, originalPath);
    if (!compatible) {
      cliError("✖ Candid compatibility check failed");
    }
    console.log(chalk.green("✓ Candid compatibility check passed"));
  } catch (error: any) {
    cliError(
      `Error while checking Candid compatibility${error?.message ? `\n${error.message}` : ""}`,
    );
  }
}
