import process from "node:process";
import chalk from "chalk";
import { checkConfigFile, getIdentity, readConfig } from "../mops.js";
import { mainActor } from "../api/actors.js";
import { Principal } from "@icp-sdk/core/principal";
import prompts from "prompts";

export async function printMaintainers() {
  if (!checkConfigFile()) {
    return;
  }

  let config = readConfig();
  let actor = await mainActor();

  let maintainers = await actor.getPackageMaintainers(
    config.package?.name || "",
  );
  console.log(`Maintainers of package ${chalk.bold(config.package?.name)}:`);
  for (let maintainer of maintainers) {
    console.log(maintainer.toText());
  }
}

export async function addMaintainer(maintainer: string, yes = false) {
  if (!checkConfigFile()) {
    return;
  }

  let config = readConfig();
  let principal = Principal.fromText(maintainer);

  if (!yes) {
    let promptsConfig = {
      onCancel() {
        console.log("aborted");
        process.exit(0);
      },
    };

    let { confirm } = await prompts(
      {
        type: "confirm",
        name: "confirm",
        message: `Are you sure you want to add maintainer ${chalk.yellow(maintainer)} to ${chalk.yellow(config.package?.name)} package?`,
        initial: true,
      },
      promptsConfig,
    );

    if (!confirm) {
      return;
    }
  }

  let identity = await getIdentity();
  let actor = await mainActor(identity);

  let res = await actor.addMaintainer(config.package?.name || "", principal);
  if ("ok" in res) {
    console.log(chalk.green("Success!"));
    console.log(
      `Added maintainer ${chalk.bold(maintainer)} to package ${chalk.bold(config.package?.name)}`,
    );
  } else {
    console.error(chalk.red("Error: ") + res.err);
    process.exit(1);
  }
}

export async function removeMaintainer(maintainer: string, yes = false) {
  if (!checkConfigFile()) {
    return;
  }

  let config = readConfig();
  let principal = Principal.fromText(maintainer);

  if (!yes) {
    let promptsConfig = {
      onCancel() {
        console.log("aborted");
        process.exit(0);
      },
    };

    let { confirm } = await prompts(
      {
        type: "confirm",
        name: "confirm",
        message: `Are you sure you want to remove maintainer ${chalk.red(maintainer)} from ${chalk.red(config.package?.name)} package?`,
        initial: true,
      },
      promptsConfig,
    );

    if (!confirm) {
      return;
    }
  }

  let identity = await getIdentity();
  let actor = await mainActor(identity);

  let res = await actor.removeMaintainer(config.package?.name || "", principal);
  if ("ok" in res) {
    console.log(chalk.green("Success!"));
    console.log(
      `Removed maintainer ${chalk.bold(maintainer)} from package ${chalk.bold(config.package?.name)}`,
    );
  } else {
    console.error(chalk.red("Error: ") + res.err);
    process.exit(1);
  }
}
