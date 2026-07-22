import chalk from "chalk";

let alreadyWarned = false;

// Warn once when `CI` auto-selects `--lock check`. Removal tracked in NEXT-MAJOR.md (GH #516).
export function warnCiLockAutoDetect(): void {
  if (alreadyWarned) {
    return;
  }
  alreadyWarned = true;
  console.log(
    chalk.yellow(
      "Using the `CI` environment variable to default `--lock` to `check` is deprecated and will be removed in a future release.\n" +
        "Pass `--lock check` (or a future `mops ci` / `--frozen` mode) explicitly to keep failing on a stale lockfile.",
    ),
  );
}
