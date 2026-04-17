import chalk from "chalk";
import {
  checkConfigFile,
  getGithubCommit,
  parseGithubURL,
  readConfig,
} from "../mops.js";
import { add } from "./add.js";
import { getAvailableUpdates } from "./available-updates.js";
import { checkIntegrity } from "../integrity.js";
import { getDepName, getDepPinnedVersion } from "../helpers/get-dep-name.js";
import { isRange, stripRangePrefix } from "../semver.js";

type UpdateOptions = {
  verbose?: boolean;
  dev?: boolean;
  lock?: "update" | "ignore";
};

export async function update(pkg?: string, { lock }: UpdateOptions = {}) {
  if (!checkConfigFile()) {
    return;
  }
  let config = readConfig();

  if (
    pkg &&
    !config.dependencies?.[pkg] &&
    !config["dev-dependencies"]?.[pkg]
  ) {
    console.log(chalk.red(`Package "${pkg}" is not installed!`));
    return;
  }

  // update github packages
  let deps = Object.values(config.dependencies || {});
  let devDeps = Object.values(config["dev-dependencies"] || {});
  let githubDeps = [...deps, ...devDeps].filter((dep) => dep.repo);
  if (pkg) {
    githubDeps = githubDeps.filter((dep) => dep.name === pkg);
  }

  for (let dep of githubDeps) {
    let { org, gitName, branch, commitHash } = parseGithubURL(dep.repo || "");
    let dev = !!config["dev-dependencies"]?.[dep.name];
    try {
      let commit = await getGithubCommit(`${org}/${gitName}`, branch);
      if (commit.sha !== commitHash) {
        await add(
          `https://github.com/${org}/${gitName}#${branch}@${commit.sha}`,
          { dev, lock },
          dep.name,
        );
      }
    } catch (err: any) {
      console.log(
        chalk.red("Error: ") + `Failed to update ${dep.name}: ${err.message}`,
      );
    }
  }

  // update mops packages
  let available = await getAvailableUpdates(config, pkg);

  if (available.length === 0) {
    if (pkg) {
      console.log(chalk.green(`Package "${pkg}" is up to date!`));
    } else {
      console.log(chalk.green("All dependencies are up to date!"));
    }
  } else {
    let devDepKeys = Object.keys(config["dev-dependencies"] || {});
    let allDepKeys = [...Object.keys(config.dependencies || {}), ...devDepKeys];

    for (let dep of available) {
      let bareOld = stripRangePrefix(dep[1]);
      let matchesName = (d: string) => {
        let pinnedVersion = getDepPinnedVersion(d);
        return (
          getDepName(d) === dep[0] &&
          (!pinnedVersion || bareOld.startsWith(pinnedVersion))
        );
      };

      let dev = devDepKeys.some(matchesName);
      let asName = allDepKeys.find(matchesName) || dep[0];
      let rangePrefix = isRange(dep[1]) ? dep[1][0] : "";
      await add(`${dep[0]}@${rangePrefix}${dep[2]}`, { dev, lock }, asName);
    }
  }

  await checkIntegrity(lock);
}
