import process from "node:process";
import child_process, { execSync } from "node:child_process";
import chalk from "chalk";
import prompts from "prompts";
import { version, globalConfigDir } from "../mops.js";
import { cleanCache } from "../cache.js";
import {
  classifySelfUpdate,
  parseCliVersion,
} from "../helpers/self-update-kind.js";
import { CliError, cliAbort, cliError } from "../error.js";

let url = "https://x344g-ziaaa-aaaap-abl7a-cai.icp0.io";

// The `mops` the shell resolves — the one an update has to end up replacing.
function detectMopsBinary() {
  let res = "";
  try {
    res = execSync("which mops").toString().trim();
  } catch (e) {}
  if (!res) {
    cliError("Couldn't detect package manager");
  }
  return res;
}

function detectPackageManager(bin: string) {
  if (bin.includes("pnpm/")) {
    return "pnpm";
  }
  // else if (bin.includes('bun/')) {
  // 	return 'bun';
  // }
  else {
    return "npm";
  }
}

function installedVersion(bin: string) {
  try {
    return parseCliVersion(
      execSync(`"${bin}" --version`, {
        stdio: ["ignore", "pipe", "ignore"],
      }).toString(),
    );
  } catch (e) {
    return "";
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

  // Not an error: a script running `mops self update` must keep succeeding
  // (and staying on its major) after the new major ships, not turn red until
  // someone edits it.
  if (!process.stdout.isTTY) {
    console.log(
      `Skipping the major update. Run ${chalk.green("mops self update --major")} to update.`,
    );
    return false;
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
        cliAbort();
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
      cliError(
        `Error: expected a version from ${url}/tags/latest, got ${JSON.stringify(latest)}.`,
      );
    }

    console.log("Current version: " + chalk.yellow(current));

    if (kind === "major" && !major && !(await confirmMajorUpdate(latest))) {
      return;
    }

    let bin = detectMopsBinary();
    // `add -g` cannot reach a project dependency, which is what `npx mops` or
    // an `npm run` script puts first on PATH via `node_modules/.bin`.
    if (bin.includes("/node_modules/.bin/")) {
      cliError(
        `mops self update manages a global install, but ${chalk.yellow(bin)} is a project dependency.\n` +
          `Update it with ${chalk.green(`npm i -D ic-mops@${latest}`)} instead.`,
      );
    }
    let pm = detectPackageManager(bin);

    console.log("Updating to version: " + chalk.green(latest));
    // Not `--silent`: that suppresses npm's own error output too, leaving
    // "Failed to update." as the only clue to why.
    let npmArgs = pm === "npm" ? ["--no-fund", "--loglevel=error"] : [];

    await new Promise<void>((resolve, reject) => {
      let proc = child_process.spawn(
        pm,
        ["add", "-g", ...npmArgs, `${url}/versions/${latest}.tgz`],
        { stdio: "inherit", detached: false },
      );

      proc.on("exit", (res) => {
        if (res !== 0) {
          reject(new CliError("Failed to update."));
          return;
        }
        resolve();
      });
    });

    // A zero exit only means the package manager installed into its own
    // global prefix. When another install of `mops` shadows that prefix on
    // PATH (bun, Volta, a second Node), the shell keeps running the old
    // version — so check the binary the shell actually resolves.
    let installed = installedVersion(bin);
    if (installed !== latest) {
      cliError(
        `Failed to update: ${pm} installed ${latest}, but ${chalk.yellow(bin)} on your PATH ${installed ? `is still ${installed}` : "did not report a version"}.\n` +
          `Remove that install, then run ${chalk.green("mops self update")} again.`,
      );
    }
    console.log(chalk.green("Success"));
  }
}

export async function uninstall() {
  console.log("Cleaning cache...");
  cleanCache();

  console.log("Uninstalling mops CLI...");
  let pm = detectPackageManager(detectMopsBinary());
  child_process.spawn(pm, ["remove", "-g", "--silent", "ic-mops"], {
    stdio: "inherit",
    detached: false,
  });

  console.log(
    chalk.yellow("Config directory has not been deleted: " + globalConfigDir),
  );

  console.log("Uninstalled");
}
