import process from "node:process";
import path from "node:path";
import chalk from "chalk";
import { createLogUpdate } from "log-update";
import {
  checkConfigFile,
  getGithubCommit,
  parseGithubURL,
  readConfig,
  writeConfig,
} from "../mops.js";
import { getHighestVersion } from "../api/getHighestVersion.js";
import { installMopsDep } from "./install/install-mops-dep.js";
import { installFromGithub } from "../vessel.js";
import { checkIntegrity } from "../integrity.js";
import { checkRequirements } from "../check-requirements.js";
import { syncLocalCache } from "./install/sync-local-cache.js";
import { notifyInstalls } from "../notify-installs.js";
import { resolvePackages } from "../resolve-packages.js";

type AddOptions = {
  verbose?: boolean;
  dev?: boolean;
  lock?: "update" | "ignore";
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function add(
  name: string,
  { verbose = false, dev = false, lock }: AddOptions = {},
  asName?: string,
) {
  if (!checkConfigFile()) {
    return;
  }

  let config = readConfig();
  if (dev) {
    if (!config["dev-dependencies"]) {
      config["dev-dependencies"] = {};
    }
  } else {
    if (!config.dependencies) {
      config.dependencies = {};
    }
  }

  let pkgDetails: any;

  // local package
  if (name.startsWith("./") || name.startsWith("../") || name.startsWith("/")) {
    pkgDetails = {
      name: path.parse(name).name === "." ? "_" : path.parse(name).name,
      path: name,
      repo: "",
      version: "",
    };
  }
  // github package
  else if (
    name.startsWith("https://github.com") ||
    name.split("/").length > 1
  ) {
    let { org, gitName, branch, commitHash } = parseGithubURL(name);

    // fetch latest commit hash of branch if not specified
    if (!commitHash) {
      let commit = await getGithubCommit(`${org}/${gitName}`, branch);
      if (!commit.sha) {
        throw Error(`Could not find commit hash for ${name}`);
      }
      commitHash = commit.sha;
    }

    pkgDetails = {
      name: asName || parseGithubURL(name).gitName,
      repo: `https://github.com/${org}/${gitName}#${branch}@${commitHash}`,
      version: "",
    };
  }
  // mops package
  else {
    let ver: string;
    if (name.includes("@")) {
      // @ts-ignore
      [name, ver] = name.split("@");
    } else {
      let versionRes = await getHighestVersion(name);
      if ("err" in versionRes) {
        console.log(chalk.red("Error: ") + versionRes.err);
        return;
      }
      ver = versionRes.ok;
    }

    pkgDetails = {
      name: asName || name,
      repo: "",
      version: ver,
    };
  }

  if (pkgDetails.repo) {
    await installFromGithub(pkgDetails.name, pkgDetails.repo, {
      verbose: verbose,
    });
  } else if (!pkgDetails.path) {
    let res = await installMopsDep(pkgDetails.name, pkgDetails.version, {
      verbose: verbose,
    });
    if (res === false) {
      return;
    }
  }

  const depsProp = dev ? "dev-dependencies" : "dependencies";
  let deps = config[depsProp];
  if (deps) {
    deps[pkgDetails.name] = pkgDetails;
  } else {
    throw Error(`Invalid config file: [${depsProp}] not found`);
  }

  writeConfig(config);

  let logUpdate = createLogUpdate(process.stdout, { showCursor: true });

  if (lock !== "ignore") {
    logUpdate("Checking integrity...");
  }

  let installedPackages = await syncLocalCache();

  await Promise.all([notifyInstalls(installedPackages), checkIntegrity(lock)]);

  logUpdate.clear();

  await checkRequirements({ verbose });

  console.log(
    chalk.green("Package installed ") +
      `${pkgDetails.name} = "${pkgDetails.repo || pkgDetails.path || pkgDetails.version}"`,
  );

  // check conflicts
  await resolvePackages({ conflicts: "warning" });
}
