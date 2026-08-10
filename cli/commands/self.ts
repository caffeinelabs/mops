import process from "node:process";
import child_process, { execSync } from "node:child_process";
import chalk from "chalk";
import prompts from "prompts";
import { version, globalConfigDir } from "../mops.js";
import { cleanCache } from "../cache.js";
import { toolchain } from "./toolchain/index.js";
import { classifySelfUpdate } from "../helpers/self-update-kind.js";

let url = "https://x344g-ziaaa-aaaap-abl7a-cai.icp0.io";

function detectPackageManager() {
  let res = "";
  try {
    res = execSync("which mops").toString();
  } catch (e) {}
  if (!res) {
    console.error(chalk.red("Couldn't detect package manager"));
    process.exit(1);
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

// A new major means breaking changes, so crossing one is a decision, not a
// routine refresh — confirmed in a terminal, `--major` everywhere else.
async function confirmMajorUpdate(latest: string): Promise<boolean> {
  console.log(
    chalk.yellow(
      `Version ${latest} is a new major release with breaking changes:`,
    ),
  );
  console.log(
    `https://github.com/caffeinelabs/mops/releases/tag/cli-v${latest}`,
  );

  if (!process.stdout.isTTY) {
    console.error(
      chalk.red("Error: ") +
        `updating across major versions requires confirmation. Run ${chalk.green("mops self update --major")} to update.`,
    );
    process.exit(1);
  }

  let { confirm } = await prompts(
    {
      type: "confirm",
      name: "confirm",
      message: `Update to ${latest}?`,
      initial: false,
    },
    {
      onCancel() {
        console.log("aborted");
        process.exit(0);
      },
    },
  );
  return confirm;
}

export async function update({ major = false } = {}) {
  let latest = await getLatestVersion();
  let current = version();
  let kind = classifySelfUpdate(current, latest);

  if (kind === "up-to-date") {
    console.log(chalk.green("You are up to date. Version: " + current));
  } else {
    // An unparseable tag means the release server is serving something
    // broken — refuse rather than npm-install whatever it said.
    if (kind === "invalid") {
      console.error(
        chalk.red("Error: ") +
          `expected a version from ${url}/tags/latest, got ${JSON.stringify(latest)}.`,
      );
      process.exit(1);
    }

    console.log("Current version: " + chalk.yellow(current));

    if (kind === "major" && !major && !(await confirmMajorUpdate(latest))) {
      console.log("aborted");
      return;
    }

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
        console.log(chalk.red("Failed to update."));
        process.exit(1);
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
