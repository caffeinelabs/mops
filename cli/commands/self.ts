import child_process, { execSync } from "node:child_process";
import chalk from "chalk";
import { version, globalConfigDir } from "../mops.js";
import { cliError } from "../error.js";
import { cleanCache } from "../cache.js";
import { toolchain } from "./toolchain/index.js";

let url = "https://x344g-ziaaa-aaaap-abl7a-cai.icp0.io";

function detectPackageManager() {
  let res = "";
  try {
    res = execSync("which mops").toString();
  } catch (e) {}
  if (!res) {
    cliError("Couldn't detect package manager");
  }
  if (res.includes("pnpm/")) {
    return "pnpm";
  }
  // else if (res.includes('bun/')) {
  // 	return 'bun';
  // }
  else {
    return "npm";
  }
}

export async function getLatestVersion() {
  let res = await fetch(url + "/tags/latest");
  return (await res.text()).trim();
}

export async function update() {
  let latest = await getLatestVersion();
  let current = version();

  if (latest === current) {
    console.log(chalk.green("You are up to date. Version: " + current));
  } else {
    console.log("Current version: " + chalk.yellow(current));
    console.log("Updating to version: " + chalk.green(latest));

    let pm = detectPackageManager();
    let npmArgs = pm === "npm" ? ["--no-fund", "--silent"] : [];

    let proc = child_process.spawn(
      pm,
      ["add", "-g", ...npmArgs, `${url}/versions/${latest}.tgz`],
      { stdio: "inherit", detached: false },
    );

    proc.on("exit", (res) => {
      if (res !== 0) {
        cliError("Failed to update.");
      }
      console.log(chalk.green("Success"));
    });
  }
}

export async function uninstall() {
  console.log("Cleaning cache...");
  cleanCache();

  console.log("Resetting toolchain management...");
  toolchain.init({ reset: true, silent: true });

  console.log("Uninstalling mops CLI...");
  let pm = detectPackageManager();
  child_process.spawn(pm, ["remove", "-g", "--silent", "ic-mops"], {
    stdio: "inherit",
    detached: false,
  });

  console.log(
    chalk.yellow("Config directory has not been deleted: " + globalConfigDir),
  );

  console.log("Uninstalled");
}
