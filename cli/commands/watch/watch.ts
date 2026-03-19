import chokidar from "chokidar";
import path from "node:path";
import debounce from "debounce";
import chalk from "chalk";
import { ErrorChecker } from "./error-checker.js";
import { WarningChecker } from "./warning-checker.js";
import {
  getMotokoCanisters,
  getMotokoCanistersWithDeclarations,
} from "./parseDfxJson.js";
import { getRootDir } from "../../mops.js";
import { Tester } from "./tester.js";
import { Generator } from "./generator.js";
import { Deployer } from "./deployer.js";
import { Formatter } from "./formatter.js";

let ignore = [
  "**/node_modules/**",
  "**/.mops/**",
  "**/.vessel/**",
  "**/.git/**",
];

export async function watch(options: {
  error: boolean;
  warning: boolean;
  test: boolean;
  generate: boolean;
  deploy: boolean;
  format: boolean;
}) {
  let hasOptions = Object.values(options).includes(true);
  if (!hasOptions) {
    options = {
      error: true,
      warning: true,
      test: true,
      generate: true,
      deploy: true,
      format: false,
    };
  }
  options.error = true;

  let rootDir = getRootDir();
  let canisters = getMotokoCanisters();
  let canistersWithDeclarations = getMotokoCanistersWithDeclarations();
  let errorChecker = new ErrorChecker({ verbose: true, canisters: canisters });
  let warningChecker = new WarningChecker({
    errorChecker,
    verbose: true,
    canisters: canisters,
  });
  let tester = new Tester({ errorChecker, verbose: true });
  let generator = new Generator({
    errorChecker,
    verbose: true,
    canisters: canistersWithDeclarations,
  });
  let deployer = new Deployer({
    errorChecker,
    generator,
    verbose: true,
    canisters: canisters,
  });
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
    generator.reset();
    deployer.reset();
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
    options.generate && (await generator.run(print));
    options.deploy && deployer.run(print);
  }, 200);

  let print = () => {
    console.clear();
    process.stdout.write("\x1Bc");

    options.error && console.log(errorChecker.getOutput());
    options.warning && console.log(warningChecker.getOutput());
    options.format && console.log(formatter.getOutput());
    options.test && console.log(tester.getOutput());
    options.generate && console.log(generator.getOutput());
    options.deploy && console.log(deployer.getOutput());

    let statuses = [];
    options.error && statuses.push(errorChecker.status);
    options.warning && statuses.push(warningChecker.status);
    options.format && statuses.push(formatter.status);
    options.test && statuses.push(tester.status);
    options.generate && statuses.push(generator.status);
    options.deploy && statuses.push(deployer.status);

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
