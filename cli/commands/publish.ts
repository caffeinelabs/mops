import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import logUpdate from "log-update";
import { globbySync } from "globby";
import { minimatch } from "minimatch";
import prompts from "prompts";
import { create as tarCreate } from "tar";

import {
  checkConfigFile,
  getIdentity,
  getRootDir,
  progressBar,
  readConfig,
} from "../mops.js";
import { mainActor } from "../api/actors.js";
import { docs } from "./docs.js";
import {
  Benchmarks,
  DependencyV2,
  PackageConfigV3_Publishing,
  Requirement,
} from "../declarations/main/main.did.js";
import { Dependency } from "../types.js";
import { testWithReporter } from "./test/test.js";
import { SilentReporter } from "./test/reporters/silent-reporter.js";
import { findChangelogEntry } from "../helpers/find-changelog-entry.js";
import { bench } from "./bench.js";
import { docsCoverage } from "./docs-coverage.js";
import { uploadBlob } from "../api/storageClient.js";

export async function publish(
  options: {
    docs?: boolean;
    test?: boolean;
    bench?: boolean;
    verbose?: boolean;
  } = {},
) {
  if (!checkConfigFile()) {
    return;
  }

  let rootDir = getRootDir();
  let config = readConfig();

  console.log(`Publishing ${config.package?.name}@${config.package?.version}`);

  // validate
  for (let key of Object.keys(config)) {
    if (
      ![
        "package",
        "dependencies",
        "dev-dependencies",
        "toolchain",
        "requirements",
      ].includes(key)
    ) {
      console.log(chalk.red("Error: ") + `Unknown config section [${key}]`);
      process.exit(1);
    }
  }

  // required fields
  if (!config.package) {
    console.log(
      chalk.red("Error: ") +
        "Please specify [package] section in your mops.toml",
    );
    process.exit(1);
  }
  for (let key of ["name", "version"]) {
    // @ts-ignore
    if (!config.package[key]) {
      console.log(
        chalk.red("Error: ") +
          `Please specify "${key}" in [package] section in your mops.toml`,
      );
      process.exit(1);
    }
  }

  // desired fields
  for (let key of ["description"]) {
    // @ts-ignore
    if (!config.package[key] && !process.env.CI) {
      let res = await prompts({
        type: "confirm",
        name: "ok",
        message: `Missing recommended config key "${key}", publish anyway?`,
      });
      if (!res.ok) {
        return;
      }
    }
  }

  let packageKeys = [
    "name",
    "version",
    "keywords",
    "description",
    "repository",
    "documentation",
    "homepage",
    "baseDir",
    "readme",
    "license",
    "files",
    "dfx",
    "moc",
    "donation",
  ];
  for (let key of Object.keys(config.package)) {
    if (!packageKeys.includes(key)) {
      console.log(chalk.red("Error: ") + `Unknown config key 'package.${key}'`);
      process.exit(1);
    }
  }

  // disabled fields
  for (let key of ["dfx", "moc", "homepage", "documentation", "donation"]) {
    if ((config.package as any)[key]) {
      console.log(chalk.red("Error: ") + `package.${key} is not supported yet`);
      process.exit(1);
    }
  }

  // check lengths
  let keysMax = {
    name: 50,
    version: 20,
    keywords: 10,
    description: 200,
    repository: 300,
    documentation: 300,
    homepage: 300,
    readme: 100,
    license: 40,
    files: 20,
    dfx: 10,
    moc: 10,
    donation: 64,
    root: 50,
  };

  for (let [key, max] of Object.entries(keysMax)) {
    // @ts-ignore
    if (config.package[key] && config.package[key].length > max) {
      console.log(
        chalk.red("Error: ") + `package.${key} value max length is ${max}`,
      );
      process.exit(1);
    }
  }

  if (config.dependencies) {
    if (Object.keys(config.dependencies).length > 100) {
      console.log(chalk.red("Error: ") + "max dependencies is 100");
      process.exit(1);
    }

    for (let dep of Object.values(config.dependencies)) {
      if (dep.path) {
        console.log(
          chalk.red("Error: ") +
            "you can't publish packages with local dependencies",
        );
        process.exit(1);
      }
      delete dep.path;
    }

    for (let dep of Object.values(config.dependencies)) {
      if (dep.repo) {
        console.log(
          chalk.red("Error: ") +
            "GitHub dependencies are no longer supported.\nIf you are the owner of the dependency, please publish it to the Mops registry.",
        );
        process.exit(1);
      }
    }
  }

  if (config["dev-dependencies"]) {
    if (Object.keys(config["dev-dependencies"]).length > 100) {
      console.log(chalk.red("Error: ") + "max dev-dependencies is 100");
      process.exit(1);
    }

    for (let dep of Object.values(config["dev-dependencies"])) {
      if (dep.path) {
        console.log(
          chalk.red("Error: ") +
            "you can't publish packages with local dev-dependencies",
        );
        process.exit(1);
      }
      delete dep.path;
    }
  }

  if (config.package.keywords) {
    for (let keyword of config.package.keywords) {
      if (keyword.length > 20) {
        console.log(chalk.red("Error: ") + "max keyword length is 20");
        return;
      }
    }
  }

  if (config.package.files) {
    for (let file of config.package.files) {
      if (file.startsWith("/") || file.startsWith("../")) {
        console.log(
          chalk.red("Error: ") + "file path cannot start with '/' or '../'",
        );
        return;
      }
    }
  }

  if (config.requirements) {
    Object.keys(config.requirements).forEach((name) => {
      if (name !== "moc") {
        console.log(chalk.red("Error: ") + `Unknown requirement "${name}"`);
        return;
      }
    });
  }

  let toBackendDep = (dep: Dependency): DependencyV2 => {
    return {
      ...dep,
      version: dep.version || "",
      repo: dep.repo || "",
    };
  };

  let toBackendReq = ([name, value]: [string, string]): Requirement => {
    return { name, value };
  };

  // map fields
  let backendPkgConfig: PackageConfigV3_Publishing = {
    name: config.package.name,
    version: config.package.version,
    keywords: config.package.keywords || [],
    description: config.package.description || "",
    repository: config.package.repository || "",
    homepage: config.package.homepage || "",
    documentation: config.package.documentation || "",
    baseDir: "src",
    readme: "README.md",
    license: config.package.license || "",
    dfx: config.package.dfx || "",
    moc: config.package.moc || "",
    donation: config.package.donation || "",
    dependencies: Object.values(config.dependencies || {}).map(toBackendDep),
    devDependencies: Object.values(config["dev-dependencies"] || {}).map(
      toBackendDep,
    ),
    scripts: [],
    requirements: [
      Object.entries(config.requirements || {}).map((req) => toBackendReq(req)),
    ],
  };

  let defaultFiles = [
    "mops.toml",
    "README.md",
    "LICENSE",
    "NOTICE",
    "rules/*.toml",
    "!.mops/**",
    "!test/**",
    "!tests/**",
    "!**/*.test.mo",
    "!**/*.Test.mo",
    "!bench/**",
    "!benchmark/**",
    "!**/*.bench.mo",
    "!**/*.Bench.mo",
    "!**/node_modules/**",
  ];
  let files = config.package.files || ["**/*.mo"];
  files = [...files, ...defaultFiles];
  files = globbySync([...files, ...defaultFiles]);

  if (options.verbose) {
    console.log("Files:");
    console.log(files.map((file) => "  " + file).join("\n"));
  }

  // generate docs
  let docsFile = path.join(rootDir, ".mops/.docs/docs.tgz");
  let docsCov = 0;
  if (options.docs) {
    console.log("Generating documentation...");
    docsCov = await docsCoverage({
      reporter: "silent",
    });
    await docs({ silent: true, archive: true });
    if (fs.existsSync(docsFile)) {
      files.unshift(docsFile);
    }
  }

  // check required files
  if (!files.includes("mops.toml")) {
    console.log(chalk.red("Error: ") + " please add mops.toml file");
    process.exit(1);
  }
  if (!files.includes("README.md")) {
    console.log(chalk.red("Error: ") + " please add README.md file");
    process.exit(1);
  }

  // check allowed exts
  for (let file of files) {
    if (
      !minimatch(file, "**/*.{mo,did,md,toml}") &&
      !file.toLowerCase().endsWith("license") &&
      !file.toLowerCase().endsWith("notice") &&
      file !== docsFile
    ) {
      console.log(
        chalk.red("Error: ") +
          `file ${file} has unsupported extension. Allowed: .mo, .did, .md, .toml`,
      );
      process.exit(1);
    }
  }

  // pre-flight file count check (must match MAX_PACKAGE_FILES in PackagePublisher.mo)
  const FILE_LIMIT = 1000;
  if (files.length > FILE_LIMIT) {
    console.log(
      chalk.red("Error: ") +
        `Too many files (${files.length}). Maximum is ${FILE_LIMIT}.`,
    );
    process.exit(1);
  }

  // parse changelog
  console.log("Parsing CHANGELOG.md...");
  let changelog = parseChangelog(config.package.version);
  if (
    !changelog &&
    config.package.repository?.startsWith("https://github.com/")
  ) {
    console.log("Fetching release notes from GitHub...");
    changelog = await fetchGitHubReleaseNotes(
      config.package.repository,
      config.package.version,
    );
  }
  if (changelog) {
    console.log("Changelog:");
    console.log(chalk.gray(changelog));
  }

  // test
  let reporter = new SilentReporter();
  if (options.test) {
    console.log("Running tests...");
    await testWithReporter(
      reporter,
      "",
      "interpreter",
      config.toolchain?.["pocket-ic"] ? "pocket-ic" : "dfx",
    );
    if (reporter.failed > 0) {
      console.log(chalk.red("Error: ") + "tests failed");
      process.exit(1);
    }
  }

  // bench
  let benchmarks: Benchmarks = [];
  if (options.bench) {
    console.log("Running benchmarks...");
    try {
      benchmarks = await bench("", {
        replica: config.toolchain?.["pocket-ic"] ? "pocket-ic" : "dfx",
        gc: "copying",
        forceGc: true,
        silent: true,
      });
    } catch (err) {
      console.error(err);
      console.log(chalk.red("Error: ") + "benchmarks failed");
      process.exit(1);
    }
  }

  let identity = await getIdentity();
  if (!identity) {
    console.log(
      chalk.red("Error: ") +
        "Identity not found. Please run `mops init` first.",
    );
    process.exit(1);
  }
  let actor = await mainActor(identity);

  // Create tar.gz archive of package files (excluding docs.tgz)
  let sourceFiles = files.filter((f) => f !== docsFile);
  console.log("Creating package archive...");
  let archivePath = path.join(rootDir, ".mops/.publish-archive.tar.gz");
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  await tarCreate(
    {
      gzip: true,
      file: archivePath,
      cwd: rootDir,
      portable: true,
    },
    sourceFiles,
  );
  let archiveData = new Uint8Array(fs.readFileSync(archivePath));
  fs.rmSync(archivePath, { force: true });

  let total = 4;
  let step = 0;
  function progress(label = "Publishing") {
    step++;
    logUpdate(`${label} ${progressBar(step, total)}`);
  }

  // start blob publish
  progress("Starting publish");
  let publishing = await actor.startBlobPublish(backendPkgConfig);
  if ("err" in publishing) {
    console.log(chalk.red("Error: ") + publishing.err);
    process.exit(1);
  }
  let publishingId = publishing.ok;

  if (options.test) {
    await actor.uploadTestStats(publishingId, {
      passed: BigInt(reporter.passed),
      passedNames: reporter.passedNamesFlat,
    });
  }

  if (options.bench) {
    await actor.uploadBenchmarks(publishingId, benchmarks);
  }

  if (changelog) {
    await actor.uploadNotes(publishingId, changelog);
  }

  if (options.docs) {
    await actor.uploadDocsCoverage(publishingId, docsCov);
  }

  // upload to Caffeine Object Storage
  progress("Uploading to blob storage");
  let rootHash: string;
  try {
    rootHash = await uploadBlob(archiveData, identity, (pct) => {
      logUpdate(
        `Uploading to blob storage ${progressBar(Math.round((pct / 100) * 80) + 2 * (100 / total), 100)}`,
      );
    });
  } catch (err) {
    console.log(chalk.red("Error: ") + `Failed to upload blob: ${err}`);
    process.exit(1);
  }

  progress("Finishing publish");

  fs.rmSync(path.join(rootDir, ".mops/.docs"), {
    force: true,
    recursive: true,
  });

  let res = await actor.finishBlobPublish(publishingId, rootHash);
  if ("err" in res) {
    console.log(chalk.red("Error: ") + res.err);
    process.exit(1);
  }

  progress("Done");
  logUpdate.done();

  console.log(
    chalk.green("Published ") +
      `${config.package.name}@${config.package.version}`,
  );
}

function parseChangelog(version: string): string {
  let rootDir = getRootDir();
  let changelogFile = "";

  let files = ["CHANGELOG.md", "Changelog.md", "changelog.md"];

  for (let file of files) {
    if (fs.existsSync(path.join(rootDir, file))) {
      changelogFile = path.join(rootDir, file);
      break;
    }
  }
  if (!changelogFile) {
    console.log(chalk.yellow("CHANGELOG.md not found"));
    return "";
  }

  let str = fs.readFileSync(changelogFile, "utf-8");
  let changelog = findChangelogEntry(str, version);

  if (!changelog) {
    console.log(chalk.yellow("No changelog entry found"));
  }

  return changelog || "";
}

type GitHubRelease = { message?: string; body?: string };

async function fetchGitHubReleaseNotes(
  repo: string,
  version: string,
): Promise<string> {
  let repoPath = new URL(repo).pathname;
  let res = await fetch(
    `https://api.github.com/repos${repoPath}/releases/tags/${version}`,
  );
  let release = (await res.json()) as GitHubRelease;

  if (release.message === "Not Found") {
    res = await fetch(
      `https://api.github.com/repos${repoPath}/releases/tags/v${version}`,
    );
    release = (await res.json()) as GitHubRelease;

    if (release.message === "Not Found") {
      console.log(
        chalk.yellow(
          `No GitHub release found with name ${version} or v${version}`,
        ),
      );
      return "";
    }
  }

  return release.body ?? "";
}
