import process from "node:process";
import chalk from "chalk";

export class CliError extends Error {
  exitCode: number;

  constructor(message?: string, exitCode = 1) {
    super(message ?? "");
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function cliError(message?: string, exitCode = 1): never {
  throw new CliError(message, exitCode);
}

export function cliAbort(message = "aborted"): never {
  throw new CliError(message, 0);
}

export function handleCliError(err: unknown): never {
  if (err instanceof CliError) {
    if (err.message) {
      if (err.exitCode === 0) {
        console.log(err.message);
      } else {
        console.error(chalk.red(err.message));
      }
    }
    // eslint-disable-next-line no-restricted-properties
    process.exit(err.exitCode);
  }
  console.error(err);
  // eslint-disable-next-line no-restricted-properties
  process.exit(1);
}
