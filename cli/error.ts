import chalk from "chalk";

export function cliError(...args: unknown[]): never {
  console.error(chalk.red(...args));
  process.exit(1);
}

export function cliExit(code: number, ...args: unknown[]): never {
  console.error(chalk.red(...args));
  process.exit(code || 1);
}
