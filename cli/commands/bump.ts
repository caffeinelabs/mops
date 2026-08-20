import prompts from "prompts";
import chalk from "chalk";
import { checkConfigFile, readConfig, writeConfig } from "../mops.js";
import { cliError } from "../error.js";

export async function bump(part: string) {
  checkConfigFile();

  if (part && !["major", "minor", "patch"].includes(part)) {
    cliError("Unknown version part. Available parts: major, minor, patch");
  }

  let config = readConfig();

  if (!config.package) {
    cliError("No [package] section found in mops.toml.");
  }

  console.log(`Current version: ${chalk.yellow.bold(config.package.version)}`);

  if (!part) {
    let res = await prompts({
      type: "select",
      name: "part",
      message: "Select new version:",
      choices: [
        {
          title: `${updateVersion(config.package.version, "major")} ${chalk.dim("(major, breaking changes)")}`,
          value: "major",
        },
        {
          title: `${updateVersion(config.package.version, "minor")} ${chalk.dim("(minor, new features)")}`,
          value: "minor",
        },
        {
          title: `${updateVersion(config.package.version, "patch")} ${chalk.dim("(patch, bug fixes)")}`,
          value: "patch",
        },
      ],
      initial: 2,
    });
    if (!res.part) {
      return;
    }
    part = res.part;
  }

  config.package.version = updateVersion(config.package.version, part);
  writeConfig(config);
  console.log(`Updated version: ${chalk.green.bold(config.package.version)}`);
}

function updateVersion(version: string, part: string) {
  let parts = version.split(".");
  let idx = ["major", "minor", "patch"].indexOf(part);
  if (!parts[idx]) {
    throw new Error(`Invalid version part: ${part}`);
  }
  parts[idx] = String(parseInt(parts[idx] || "0") + 1);
  for (let i = idx + 1; i < parts.length; i++) {
    parts[i] = "0";
  }
  return parts.join(".");
}
