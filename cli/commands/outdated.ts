import chalk from "chalk";
import { checkConfigFile, readConfig } from "../mops.js";
import { getAvailableUpdates } from "./available-updates.js";
import { getDepName, getDepPinnedVersion } from "../helpers/get-dep-name.js";

export async function outdated() {
  if (!checkConfigFile()) {
    return;
  }
  let config = readConfig();

  let available = await getAvailableUpdates(config);

  if (available.length === 0) {
    console.log(chalk.green("All dependencies are up to date!"));
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
  }
}
