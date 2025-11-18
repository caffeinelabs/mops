import chalk from "chalk";

export function cliError(...args: unknown[]) {
  console.error(chalk.red(...args));
  process.exit(1);
}
