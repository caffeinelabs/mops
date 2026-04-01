import chalk from "chalk";

export function cliError(message?: string, exitCode = 1): never {
  if (message) {
    console.error(chalk.red(message));
  }
  // eslint-disable-next-line no-restricted-properties
  process.exit(exitCode);
}

export function cliAbort(message = "aborted"): never {
  if (message !== "") {
    console.log(message);
  }
  // eslint-disable-next-line no-restricted-properties
  process.exit(0);
}
