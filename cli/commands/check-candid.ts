import chalk from "chalk";
import { checkCandidCompatibility } from "../helpers/candid-compatibility.js";
import { cliError, cliErrorFrom } from "../error.js";

export interface CheckCandidOptions {
  verbose?: boolean;
}

export async function checkCandid(
  newPath: string,
  originalPath: string,
): Promise<void> {
  try {
    const incompatibility = await checkCandidCompatibility(
      newPath,
      originalPath,
    );
    if (incompatibility) {
      cliError(`✖ Candid compatibility check failed\n${incompatibility}`);
    }
    console.log(chalk.green("✓ Candid compatibility check passed"));
  } catch (error) {
    cliErrorFrom(error, "Error while checking Candid compatibility");
  }
}
