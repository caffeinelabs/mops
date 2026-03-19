import process from "node:process";
import chalk from "chalk";
import { checkConfigFile, getIdentity, readConfig } from "../mops.js";
import { mainActor } from "../api/actors.js";
import { Principal } from "@icp-sdk/core/principal";
import prompts from "prompts";

export async function printOwners() {
  if (!checkConfigFile()) {
    return;
  }

  let config = readConfig();
  let actor = await mainActor();

  let owners = await actor.getPackageOwners(config.package?.name || "");
  console.log(`Owners of package ${chalk.bold(config.package?.name)}:`);
  for (let owner of owners) {
    console.log(owner.toText());
  }
}

export async function addOwner(owner: string, yes = false) {
  if (!checkConfigFile()) {
    return;
  }

  let config = readConfig();
  let principal = Principal.fromText(owner);

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
        message: `Are you sure you want to add owner ${chalk.yellow(owner)} to ${chalk.yellow(config.package?.name)} package?`,
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

  let res = await actor.addOwner(config.package?.name || "", principal);
  if ("ok" in res) {
    console.log(chalk.green("Success!"));
    console.log(
      `Added owner ${chalk.bold(owner)} to package ${chalk.bold(config.package?.name)}`,
    );
  } else {
    console.error(chalk.red("Error: ") + res.err);
    process.exit(1);
  }
}

export async function removeOwner(owner: string, yes = false) {
  if (!checkConfigFile()) {
    return;
  }

  let config = readConfig();
  let principal = Principal.fromText(owner);

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
        message: `Are you sure you want to remove owner ${chalk.red(owner)} from ${chalk.red(config.package?.name)} package?`,
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

  let res = await actor.removeOwner(config.package?.name || "", principal);
  if ("ok" in res) {
    console.log(chalk.green("Success!"));
    console.log(
      `Removed owner ${chalk.bold(owner)} from package ${chalk.bold(config.package?.name)}`,
    );
  } else {
    console.error(chalk.red("Error: ") + res.err);
    process.exit(1);
  }
}
