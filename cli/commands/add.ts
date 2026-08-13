import process from "node:process";
import fs from "node:fs";
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
import { installFromGithub } from "./install/install-from-github.js";
import { checkIntegrity, LockPolicy } from "../integrity.js";
import { checkRequirements } from "../check-requirements.js";
import { syncLocalCache } from "./install/sync-local-cache.js";
import { notifyInstalls } from "../notify-installs.js";
import { Config, Dependency } from "../types.js";
import { getDepName, getDepPinnedVersion } from "../helpers/get-dep-name.js";
import { getPackageId } from "../helpers/get-package-id.js";
import { cliError } from "../error.js";

type AddOptions = {
  verbose?: boolean;
  dev?: boolean;
  // Internal: `mops sync`/`mops update` pass "skip" to batch many add/remove
  // calls into a single lock update at the end. Not exposed as a flag.
  lock?: LockPolicy;
  // Only the interactive `mops add` moves an entry between sections. `mops
  // update` reaches here for a package it already located in one section, and a
  // manifest that declares it in both — from the old duplicating bug, or by
  // hand — would silently lose the other entry to an unrelated version bump.
  moveSections?: boolean;
};

// `org/repo`, optionally with `#branch`, `#tag` or `#commit` (branches may
// contain slashes, so the fragment is not restricted).
const GITHUB_SHORTHAND_REGEX = /^[\w.-]+\/[\w.-]+(#\S+)?$/;

function findDeclared(config: Config, key: string): Dependency | undefined {
  return config.dependencies?.[key] || config["dev-dependencies"]?.[key];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function add(
  name: string,
  {
    verbose = false,
    dev = false,
    lock = "maintain",
    moveSections = false,
  }: AddOptions = {},
  asName?: string,
) {
  checkConfigFile();

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
  let pinNote = "";

  // local package
  if (name.startsWith("./") || name.startsWith("../") || name.startsWith("/")) {
    pkgDetails = {
      name: path.parse(name).name === "." ? "_" : path.parse(name).name,
      path: name,
      repo: "",
      version: "",
    };
  }
  // github package, by url or `org/repo` shorthand
  else if (
    name.startsWith("https://github.com") ||
    GITHUB_SHORTHAND_REGEX.test(name)
  ) {
    let href = name.startsWith("https://")
      ? name
      : `https://github.com/${name}`;
    let { org, gitName, branch, commitHash } = parseGithubURL(href);

    // fetch latest commit hash of branch if not specified
    if (!commitHash) {
      // a typo in the repo or branch is a user error, not a crash
      let commit = await getGithubCommit(`${org}/${gitName}`, branch).catch(
        (err: Error) => {
          // `org/repo` and `org/repo/..` are indistinguishable without the `./`
          let hint = fs.existsSync(name)
            ? `\n"${name}" exists locally — add a local package as ${chalk.green(`./${name}`)}`
            : "";
          cliError("Error: " + err.message + hint);
        },
      );
      if (!commit.sha) {
        throw Error(`Could not find commit hash for ${name}`);
      }
      commitHash = commit.sha;
    }

    pkgDetails = {
      name: asName || gitName,
      repo: `https://github.com/${org}/${gitName}#${branch}@${commitHash}`,
      version: "",
    };
  }
  // A slash means the argument was meant as a path or a repo, not a package
  // name — without this it reaches `new URL` and throws ERR_INVALID_URL.
  else if (name.includes("/")) {
    cliError(
      `Error: Cannot add "${name}". Expected a package name (${chalk.green("core")}), ` +
        `a GitHub repo (${chalk.green("org/repo")} or ${chalk.green("https://github.com/org/repo")}) ` +
        `or a local path (${chalk.green("./pkg")})`,
    );
  }
  // mops package
  else {
    let depName = getDepName(name);
    let ver = getDepPinnedVersion(name);
    if (!ver) {
      let versionRes = await getHighestVersion(depName);
      if ("err" in versionRes) {
        cliError("Error: " + versionRes.err);
      }
      ver = versionRes.ok;
    }

    // A pinned alias key (`"map@8.1.0" = "8.1.0"`) is updated in place —
    // collapsing it to the bare name would declare the package twice.
    let aliasKey = getPackageId(depName, ver);
    let key = asName || (findDeclared(config, aliasKey) ? aliasKey : depName);
    let replaced = findDeclared(config, key);
    // `mops update`/`mops sync` pass `asName` and replace versions on purpose
    if (!asName && replaced?.version && replaced.version !== ver) {
      pinNote =
        `replaced ${key} = "${replaced.version}". ` +
        `Keep both versions by adding ${chalk.green(`"${getPackageId(key, replaced.version)}" = "${replaced.version}"`)} to mops.toml`;
    }

    pkgDetails = {
      name: key,
      repo: "",
      version: ver,
    };
  }

  if (pkgDetails.repo) {
    let res = await installFromGithub(pkgDetails.name, pkgDetails.repo, {
      verbose: verbose,
    });
    if (!res) {
      cliError();
    }
  } else if (!pkgDetails.path) {
    let res = await installMopsDep(pkgDetails.name, pkgDetails.version, {
      verbose: verbose,
    });
    if (res === false) {
      return;
    }
  }

  const depsProp = dev ? "dev-dependencies" : "dependencies";
  const otherProp = dev ? "dependencies" : "dev-dependencies";
  let deps = config[depsProp];
  if (!deps) {
    throw Error(`Invalid config file: [${depsProp}] not found`);
  }

  // `cargo add --dev` and `npm i -D` move an existing entry between sections
  // instead of declaring the package twice.
  let otherDeps = config[otherProp];
  let moved = moveSections && Boolean(otherDeps?.[pkgDetails.name]);
  if (moved) {
    delete otherDeps?.[pkgDetails.name];
  }

  deps[pkgDetails.name] = pkgDetails;

  writeConfig(config);

  let logUpdate = createLogUpdate(process.stdout, { showCursor: true });

  if (lock !== "skip") {
    logUpdate("Checking integrity...");
  }

  let installedPackages = await syncLocalCache();

  await Promise.all([notifyInstalls(installedPackages), checkIntegrity(lock)]);

  logUpdate.clear();

  await checkRequirements({ verbose });

  console.log(
    chalk.green("Package installed ") +
      `${pkgDetails.name} = "${pkgDetails.repo || pkgDetails.path || pkgDetails.version}"` +
      ` in [${depsProp}]`,
  );

  if (moved) {
    console.log(
      chalk.green("Package moved ") +
        `${pkgDetails.name} from [${otherProp}] to [${depsProp}]`,
    );
  }

  if (pinNote) {
    console.log(chalk.yellow("Note: ") + pinNote);
  }
}
