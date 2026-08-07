import chokidar from "chokidar";
import path from "node:path";
import debounce from "debounce";
import chalk from "chalk";
import { ErrorChecker } from "./error-checker.js";
import { WarningChecker } from "./warning-checker.js";
import { getRootDir } from "../../mops.js";
import { Tester } from "./tester.js";
import { Formatter } from "./formatter.js";

let ignore = ["**/node_modules/**", "**/.mops/**", "**/.git/**"];

export async function watch(options: {
  error: boolean;
  warning: boolean;
  test: boolean;
  format: boolean;
}) {
  // No flags = the safe informative set. The test task runs only when
  // explicitly requested.
  let hasOptions = Object.values(options).includes(true);
  if (!hasOptions) {
    options = {
      error: true,
      warning: true,
      format: true,
      test: false,
    };
  }
  options.error = true;

  let rootDir = getRootDir();
  let errorChecker = new ErrorChecker({ verbose: true });
  let warningChecker = new WarningChecker({ errorChecker, verbose: true });
  let tester = new Tester({ errorChecker, verbose: true });
  let formatter = new Formatter({ errorChecker, verbose: true });

  let watcher = chokidar.watch(
    [path.join(rootDir, "**/*.mo"), path.join(rootDir, "mops.toml")],
    {
      ignored: ignore,
      ignoreInitial: true,
    },
  );

  let formatting = false;

  let run = debounce(async () => {
    if (formatting) {
      return;
    }

    errorChecker.reset();
    warningChecker.reset();
    tester.reset();
    formatter.reset();

    if (options.format) {
      formatting = true;
    }

    options.error && (await errorChecker.run(print));
    options.warning && warningChecker.run(print);
    options.format &&
      formatter
        .run(print)
        .then(() => setTimeout(() => (formatting = false), 500));
    options.test && tester.run(print);
  }, 200);

  let print = () => {
    console.clear();
    process.stdout.write("\x1Bc");

    options.error && console.log(errorChecker.getOutput());
    options.warning && console.log(warningChecker.getOutput());
    options.format && console.log(formatter.getOutput());
    options.test && console.log(tester.getOutput());

    let statuses = [];
    options.error && statuses.push(errorChecker.status);
    options.warning && statuses.push(warningChecker.status);
    options.format && statuses.push(formatter.status);
    options.test && statuses.push(tester.status);

    if (
      statuses.every((status) => status !== "pending" && status !== "running")
    ) {
      console.log(chalk.dim("-".repeat(50)));
      console.log(chalk.dim("Waiting for file changes..."));
      console.log(chalk.dim(`Press ${chalk.bold("Ctrl+C")} to exit.`));
    }
  };

  watcher.on("all", () => {
    if (!formatting) {
      run();
    }
  });
  run();
}
