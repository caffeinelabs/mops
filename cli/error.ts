import process from "node:process";
import chalk from "chalk";

// The CLI's error-signalling contract: raise a CliError anywhere and it
// propagates through every `finally` (releasing locks, cleaning temp dirs)
// up to handleCliError — the single place allowed to call process.exit().
export class CliError extends Error {
  exitCode: number;

  constructor(message = "", exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function cliError(message?: string): never {
  throw new CliError(message);
}

export function cliExit(code: number, message?: string): never {
  throw new CliError(message, code || 1);
}

export function cliAbort(message = "aborted"): never {
  throw new CliError(message, 0);
}

// For catch blocks that add context to unexpected errors: an already-raised
// CliError passes through untouched instead of being buried under the context.
export function cliErrorFrom(err: unknown, context: string): never {
  if (err instanceof CliError) {
    throw err;
  }
  let detail = err instanceof Error ? err.message : String(err ?? "");
  throw new CliError(detail ? `${context}\n${detail}` : context);
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
