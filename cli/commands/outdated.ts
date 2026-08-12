import process from "node:process";
import chalk from "chalk";
import { checkConfigFile, readConfig } from "../mops.js";
import {
  GithubUpdates,
  UpdateBound,
  getAvailableGithubUpdates,
  getAvailableUpdates,
} from "./available-updates.js";
import { getDepName, getDepPinnedVersion } from "../helpers/get-dep-name.js";

// grep/diff convention: 1 = "found something", 2 = "failed to look". A CI gate can
// fail on any non-zero code and still tell a stale dependency from a broken lookup.
const EXIT_OUTDATED = 1;
const EXIT_ERROR = 2;

export async function outdated(
  pkg?: string,
  { major, patch }: { major?: boolean; patch?: boolean } = {},
) {
  if (!checkConfigFile()) {
    process.exitCode = EXIT_ERROR;
    return;
  }
  let config = readConfig();

  if (
    pkg &&
    !config.dependencies?.[pkg] &&
    !config["dev-dependencies"]?.[pkg]
  ) {
    console.log(chalk.red(`Package "${pkg}" is not installed!`));
    process.exitCode = EXIT_ERROR;
    return;
  }

  let bound: UpdateBound = major ? "major" : patch ? "patch" : "caret";
  let available: Array<[string, string, string]>;
  let github: GithubUpdates;

  try {
    [available, github] = await Promise.all([
      getAvailableUpdates(config, pkg, bound, { throwOnError: true }),
      getAvailableGithubUpdates(config, pkg),
    ]);
  } catch (err: any) {
    console.log(chalk.red("Error:"), err.message || err);
    process.exitCode = EXIT_ERROR;
    return;
  }

  if (available.length === 0 && github.updates.length === 0) {
    if (github.errors.length === 0) {
      console.log(
        chalk.green(
          pkg
            ? `Package "${pkg}" is up to date!`
            : "All dependencies are up to date!",
        ),
      );
    }
  } else {
    console.log("Available updates:");
    let allDeps = [
      ...Object.keys(config.dependencies || {}),
      ...Object.keys(config["dev-dependencies"] || {}),
    ];
    for (let dep of available) {
      let name =
        allDeps.find((d) => {
          let pinnedVersion = getDepPinnedVersion(d);
          return (
            getDepName(d) === dep[0] &&
            (!pinnedVersion || dep[1].startsWith(pinnedVersion))
          );
        }) || dep[0];

      console.log(`${name} ${chalk.yellow(dep[1])} -> ${chalk.green(dep[2])}`);
    }
    for (let dep of github.updates) {
      let current = dep.current ? dep.current.slice(0, 7) : "unpinned";
      console.log(
        `${dep.name} ${chalk.yellow(current)} -> ${chalk.green(dep.latest.slice(0, 7))} ` +
          chalk.dim(`(github: ${dep.repo}#${dep.branch})`),
      );
    }
  }

  for (let err of github.errors) {
    console.log(
      chalk.red("Error: ") + `Failed to check ${err.name}: ${err.message}`,
    );
  }

  // An incomplete report must not pass for a clean bill of health.
  if (github.errors.length) {
    process.exitCode = EXIT_ERROR;
  } else if (available.length || github.updates.length) {
    process.exitCode = EXIT_OUTDATED;
  }
}
