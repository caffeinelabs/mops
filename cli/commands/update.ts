import process from "node:process";
import chalk from "chalk";
import { checkConfigFile, readConfig } from "../mops.js";
import { add } from "./add.js";
import {
  getAvailableGithubUpdates,
  getAvailableUpdates,
} from "./available-updates.js";
import { checkIntegrity } from "../integrity.js";
import { getDepName, getDepPinnedVersion } from "../helpers/get-dep-name.js";

// Same vocabulary as `mops outdated`: 2 = "the command could not be completed".
const EXIT_ERROR = 2;

type UpdateOptions = {
  verbose?: boolean;
  dev?: boolean;
  major?: boolean;
  patch?: boolean;
};

export async function update(
  pkg?: string,
  { major, patch }: UpdateOptions = {},
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

  // update github packages
  let github = await getAvailableGithubUpdates(config, pkg);

  let reportGithubFailure = (name: string, message: string) => {
    console.log(chalk.red("Error: ") + `Failed to update ${name}: ${message}`);
  };

  for (let dep of github.updates) {
    let dev = !!config["dev-dependencies"]?.[dep.name];
    try {
      await add(
        `https://github.com/${dep.repo}#${dep.branch}@${dep.latest}`,
        { dev, lock: "skip" },
        dep.name,
      );
    } catch (err: any) {
      reportGithubFailure(dep.name, err.message);
    }
  }

  for (let err of github.errors) {
    reportGithubFailure(err.name, err.message);
  }

  // update mops packages
  let available = await getAvailableUpdates(
    config,
    pkg,
    major ? "major" : patch ? "patch" : "caret",
  );

  if (available.length === 0) {
    if (pkg) {
      console.log(chalk.green(`Package "${pkg}" is up to date!`));
    } else {
      console.log(chalk.green("All dependencies are up to date!"));
    }
  } else {
    for (let dep of available) {
      let devDeps = Object.keys(config["dev-dependencies"] || {});
      let allDeps = [...Object.keys(config.dependencies || {}), ...devDeps];

      let dev = false;
      for (let d of devDeps) {
        let pinnedVersion = getDepPinnedVersion(d);
        if (
          getDepName(d) === dep[0] &&
          (!pinnedVersion || dep[1].startsWith(pinnedVersion))
        ) {
          dev = true;
          break;
        }
      }

      let asName =
        allDeps.find((d) => {
          let pinnedVersion = getDepPinnedVersion(d);
          return (
            getDepName(d) === dep[0] &&
            (!pinnedVersion || dep[1].startsWith(pinnedVersion))
          );
        }) || dep[0];

      await add(`${dep[0]}@${dep[2]}`, { dev, lock: "skip" }, asName);
    }
  }

  await checkIntegrity();
}
