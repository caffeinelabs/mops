import path from "node:path";
import { execSync } from "node:child_process";
import { globSync } from "glob";
import chalk from "chalk";
import { checkConfigFile, getRootDir, readConfig } from "../mops.js";
import { add } from "./add.js";
import { remove } from "./remove.js";
import { checkIntegrity } from "../integrity.js";
import { toolchain } from "./toolchain/index.js";
import { MOTOKO_IGNORE_PATTERNS } from "../constants.js";

export type SyncOptions = {
  dryRun?: boolean;
};

export type UsedPackages = {
  prod: Set<string>;
  dev: Set<string>;
};

export type DeclaredPackages = {
  deps: Set<string>;
  devDeps: Set<string>;
};

export type SyncPlan = {
  add: { name: string; dev: boolean }[];
  remove: { name: string; dev: boolean }[];
};

// Same directory shapes `mops test` and `mops bench` collect from.
const DEV_SOURCE_PATTERNS = ["**/test?(s)/**/*.mo", "**/bench?(mark)/**/*.mo"];

export async function sync({ dryRun = false }: SyncOptions = {}) {
  if (!checkConfigFile()) {
    return;
  }

  let used = await getUsedPackages();
  let config = readConfig();
  let declared = {
    deps: new Set(Object.keys(config.dependencies || {})),
    devDeps: new Set(Object.keys(config["dev-dependencies"] || {})),
  };
  let plan = computeSyncPlan(used, declared);

  let names = (entries: { name: string }[]) =>
    [...new Set(entries.map((entry) => entry.name))].join(", ");

  plan.add.length &&
    console.log(`${chalk.yellow("Missing packages:")} ${names(plan.add)}`);
  plan.remove.length &&
    console.log(`${chalk.yellow("Unused packages:")} ${names(plan.remove)}`);

  if (dryRun) {
    for (let { name, dev } of plan.add) {
      console.log(chalk.green("Would add ") + name + (dev ? " (dev)" : ""));
    }
    for (let { name, dev } of plan.remove) {
      console.log(chalk.red("Would remove ") + name + (dev ? " (dev)" : ""));
    }
    if (!plan.add.length && !plan.remove.length) {
      console.log("Everything is in sync");
    }
    return;
  }

  // `asName` keeps the declared key intact — `add` otherwise splits a pinned
  // alias like `map@8.1.0` and writes it back under the bare `map` key.
  for (let { name, dev } of plan.add) {
    await add(name, { dev, lock: "skip" }, name);
  }

  for (let { name, dev } of plan.remove) {
    await remove(name, { dev, lock: "skip" });
  }

  await checkIntegrity();
}

// `mo:map@8.1.0/Map` -> `map@8.1.0`. An import names the mops.toml key
// verbatim, pinned alias included, so it must not be reduced to the base
// package name.
export function parseImportedPackage(dep: string): string | undefined {
  let trimmed = dep.trim();
  if (
    !trimmed.startsWith("mo:") ||
    trimmed.startsWith("mo:prim") ||
    trimmed.startsWith("mo:⛔")
  ) {
    return undefined;
  }
  return trimmed.replace(/^mo:([^/]+).*$/, "$1") || undefined;
}

export function computeSyncPlan(
  used: UsedPackages,
  declared: DeclaredPackages,
): SyncPlan {
  let plan: SyncPlan = { add: [], remove: [] };
  let isDeclared = (name: string) =>
    declared.deps.has(name) || declared.devDeps.has(name);
  let isUsed = (name: string) => used.prod.has(name) || used.dev.has(name);

  for (let name of used.prod) {
    if (!isDeclared(name)) {
      plan.add.push({ name, dev: false });
    }
  }
  for (let name of used.dev) {
    if (!isDeclared(name) && !used.prod.has(name)) {
      plan.add.push({ name, dev: true });
    }
  }

  // A name declared in both sections is unused in both, so drop both entries.
  for (let name of declared.deps) {
    if (!isUsed(name)) {
      plan.remove.push({ name, dev: false });
    }
  }
  for (let name of declared.devDeps) {
    if (!isUsed(name)) {
      plan.remove.push({ name, dev: true });
    }
  }

  return plan;
}

// Motoko sources of the project, split by whether they only ship as tests or
// benchmarks.
export function getSourceFiles(rootDir: string): {
  prod: string[];
  dev: string[];
} {
  let globOptions = {
    cwd: rootDir,
    nocase: true,
    ignore: MOTOKO_IGNORE_PATTERNS,
  };
  let devFiles = new Set(globSync(DEV_SOURCE_PATTERNS, globOptions));
  let files = globSync("**/*.mo", globOptions);
  return {
    prod: files.filter((file) => !devFiles.has(file)),
    dev: files.filter((file) => devFiles.has(file)),
  };
}

async function getUsedPackages(): Promise<UsedPackages> {
  let rootDir = getRootDir();
  let mocPath = await toolchain.bin("moc");

  let sourceFiles = getSourceFiles(rootDir);
  let devFiles = new Set(sourceFiles.dev);
  let files = [...sourceFiles.prod, ...sourceFiles.dev];

  let used: UsedPackages = { prod: new Set(), dev: new Set() };

  for (let file of files) {
    let target = devFiles.has(file) ? used.dev : used.prod;

    let deps: string[] = execSync(
      `${mocPath} --print-deps ${path.join(rootDir, file)}`,
    )
      .toString()
      .trim()
      .split("\n");

    for (let dep of deps) {
      let pkg = parseImportedPackage(dep);
      if (pkg) {
        target.add(pkg);
      }
    }
  }

  return used;
}
