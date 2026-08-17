import process from "node:process";
import chalk from "chalk";
import { checkConfigFile, readConfig, writeConfig } from "../mops.js";
import {
  getAvailableGithubUpdates,
  getAvailableUpdates,
} from "./available-updates.js";
import { installMopsDep } from "./install/install-mops-dep.js";
import { installFromGithub } from "./install/install-from-github.js";
import {
  createInstallScope,
  fileThreadsPerPackage,
  nextRetryBudget,
  noteTransientNetworkError,
  packageConcurrency,
  requestBudget,
  runInInstallScope,
} from "./install/install-concurrency.js";
import { parallel } from "../parallel.js";
import { syncLocalCache } from "./install/sync-local-cache.js";
import { notifyInstalls } from "../notify-installs.js";
import { checkIntegrity } from "../integrity.js";
import { checkRequirements } from "../check-requirements.js";
import { Dependency } from "../types.js";
import { getDepName, getDepPinnedVersion } from "../helpers/get-dep-name.js";

// Same vocabulary as `mops outdated`: 2 = "the command could not be completed".
const EXIT_ERROR = 2;

type UpdateOptions = {
  verbose?: boolean;
  dev?: boolean;
  major?: boolean;
  patch?: boolean;
};

// One pending update: how to install the new version, and — only once that
// succeeds — what to write back to mops.toml under which key.
type UpdateTask = {
  key: string;
  dev: boolean;
  entry: Dependency;
  install: (threads: number) => Promise<boolean>;
  summary: string;
};

export async function update(
  pkg?: string,
  { verbose, major, patch }: UpdateOptions = {},
) {
  checkConfigFile(EXIT_ERROR);
  let config = readConfig();

  if (
    pkg &&
    !config.dependencies?.[pkg] &&
    !config["dev-dependencies"]?.[pkg]
  ) {
    console.log(chalk.red(`Package "${pkg}" is not installed!`));
    process.exitCode = EXIT_ERROR;
    return;
  }

  // The registry batch call and the per-repo GitHub lookups are independent
  // round-trips.
  let [github, available] = await Promise.all([
    getAvailableGithubUpdates(config, pkg),
    getAvailableUpdates(
      config,
      pkg,
      major ? "major" : patch ? "patch" : "caret",
    ),
  ]);

  // An update that silently skipped a dep must not exit 0 (see EXIT_ERROR).
  let reportFailure = (name: string, message: string) => {
    console.log(chalk.red("Error: ") + `Failed to update ${name}: ${message}`);
    process.exitCode = EXIT_ERROR;
  };

  for (let err of github.errors) {
    reportFailure(err.name, err.message);
  }

  let tasks: UpdateTask[] = [];

  for (let dep of github.updates) {
    let repo = `https://github.com/${dep.repo}#${dep.branch}@${dep.latest}`;
    tasks.push({
      key: dep.name,
      dev: !!config["dev-dependencies"]?.[dep.name],
      entry: { name: dep.name, repo, version: "" },
      install: () => installFromGithub(dep.name, repo, { verbose }),
      summary:
        `${dep.name} ${chalk.yellow(dep.current ? dep.current.slice(0, 7) : "unpinned")} -> ${chalk.green(dep.latest.slice(0, 7))} ` +
        chalk.dim(`(github: ${dep.repo}#${dep.branch})`),
    });
  }

  let devDeps = Object.keys(config["dev-dependencies"] || {});
  let allDeps = [...Object.keys(config.dependencies || {}), ...devDeps];

  for (let [name, oldVersion, newVersion] of available) {
    // The declared key can pin a version prefix (`"map@8" = "..."`); matching
    // against it keeps the alias key instead of duplicating the package.
    let matchesKey = (key: string) => {
      let pinnedVersion = getDepPinnedVersion(key);
      return (
        getDepName(key) === name &&
        (!pinnedVersion || oldVersion.startsWith(pinnedVersion))
      );
    };
    let key = allDeps.find(matchesKey) || name;
    tasks.push({
      key,
      dev: devDeps.some(matchesKey),
      entry: { name: key, repo: "", version: newVersion },
      install: (threads) =>
        installMopsDep(name, newVersion, { verbose, threads }),
      summary: `${key} ${chalk.yellow(oldVersion)} -> ${chalk.green(newVersion)}`,
    });
  }

  if (tasks.length === 0) {
    if (github.errors.length === 0) {
      console.log(
        chalk.green(
          pkg
            ? `Package "${pkg}" is up to date!`
            : "All dependencies are up to date!",
        ),
      );
    }
    await checkIntegrity();
    return;
  }

  // Install every new version before touching mops.toml. One scope bounds the
  // run the way installDeps does: the pool divides the request budget,
  // transitive installs inherit their package's thread share, and a transient
  // network failure retries the still-failed updates with the budget halved.
  let succeeded = new Set<UpdateTask>();
  let failed = new Map<UpdateTask, string>();
  let pending = tasks;
  let budget = requestBudget();
  for (let attempt = 1; ; attempt++) {
    let poolSize = packageConcurrency(pending.length, budget);
    let threads = fileThreadsPerPackage(poolSize, budget);
    let scope = createInstallScope(threads);
    failed = new Map();
    await runInInstallScope(scope, () =>
      parallel(poolSize, pending, async (task) => {
        try {
          if (await task.install(threads)) {
            succeeded.add(task);
          } else {
            failed.set(task, "install failed");
          }
        } catch (err: any) {
          // a thrown transient error earns a retry like a noted one
          noteTransientNetworkError(err);
          // install errors carry an "Error: " prefix of their own; strip it,
          // and never report an empty reason.
          failed.set(
            task,
            (err?.message || "").replace(/^Error: /, "") || "install failed",
          );
        }
      }),
    );
    if (!failed.size) {
      break;
    }
    let retryBudget = nextRetryBudget(scope, undefined, attempt, budget);
    if (retryBudget === undefined) {
      break;
    }
    budget = retryBudget;
    pending = [...failed.keys()];
  }

  // A failed dep keeps its old mops.toml entry; the successful ones land in a
  // single write, so the resolver walks the new dependency graph exactly once.
  if (succeeded.size) {
    for (let task of tasks) {
      if (succeeded.has(task)) {
        let deps = task.dev
          ? (config["dev-dependencies"] ??= {})
          : (config.dependencies ??= {});
        deps[task.key] = task.entry;
      }
    }
    writeConfig(config);
  }

  for (let task of tasks) {
    if (succeeded.has(task)) {
      console.log(chalk.green("Updated ") + task.summary);
    }
  }
  for (let task of tasks) {
    let reason = failed.get(task);
    if (reason !== undefined) {
      reportFailure(task.key, reason);
    }
  }

  if (succeeded.size) {
    let installedPackages = await syncLocalCache();
    await Promise.all([notifyInstalls(installedPackages), checkIntegrity()]);
    await checkRequirements({ verbose });
  } else {
    await checkIntegrity();
  }
}
