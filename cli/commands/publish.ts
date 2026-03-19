import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import logUpdate from "log-update";
import { globbySync } from "globby";
import { minimatch } from "minimatch";
import prompts from "prompts";

import {
  checkConfigFile,
  getIdentity,
  getRootDir,
  progressBar,
  readConfig,
} from "../mops.js";
import { mainActor } from "../api/actors.js";
import { parallel } from "../parallel.js";
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
  for (let key of ["description", "repository"]) {
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
    license: 30,
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
      if (dep.repo && !process.env.CI) {
        let res = await prompts({
          type: "confirm",
          name: "ok",
          message:
            chalk.yellow(
              "GitHub dependencies make the registry less reliable and limit its capabilities.\nIf you are the owner of the dependency, please consider publishing it to the Mops registry.",
            ) + "\n\nPublish anyway?",
        });
        if (!res.ok) {
          return;
        }
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

  // parse changelog
  console.log("Parsing CHANGELOG.md...");
  let changelog = parseChangelog(config.package.version);
  if (!changelog && config.package.repository) {
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

  // progress
  let total = files.length + 2;
  let step = 0;
  function progress() {
    step++;
    logUpdate(`Uploading files ${progressBar(step, total)}`);
  }

  // upload config
  let identity = await getIdentity();
  let actor = await mainActor(identity);

  progress();
  let publishing = await actor.startPublish(backendPkgConfig);
  if ("err" in publishing) {
    console.log(chalk.red("Error: ") + publishing.err);
    process.exit(1);
  }
  let puiblishingId = publishing.ok;

  // upload test stats
  if (options.test) {
    await actor.uploadTestStats(puiblishingId, {
      passed: BigInt(reporter.passed),
      passedNames: reporter.passedNamesFlat,
    });
  }

  // upload benchmarks
  if (options.bench) {
    await actor.uploadBenchmarks(puiblishingId, benchmarks);
  }

  // upload changelog
  if (changelog) {
    await actor.uploadNotes(puiblishingId, changelog);
  }

  // upload docs coverage
  if (options.docs) {
    await actor.uploadDocsCoverage(puiblishingId, docsCov);
  }

  // upload files
  await parallel(8, files, async (file: string) => {
    progress();

    let chunkSize = 1024 * 1024 + 512 * 1024; // 1.5mb
    let content = fs.readFileSync(file);
    let chunkCount = Math.ceil(content.length / chunkSize);
    let firstChunk = Array.from(content.slice(0, chunkSize));

    // remove path from docs file
    if (file === docsFile) {
      file = path.basename(file);
    }

    let res = await actor.startFileUpload(
      puiblishingId,
      file,
      BigInt(chunkCount),
      firstChunk,
    );
    if ("err" in res) {
      console.log(chalk.red("Error: ") + res.err);
      process.exit(1);
    }
    let fileId = res.ok;

    for (let i = 1; i < chunkCount; i++) {
      let start = i * chunkSize;
      let chunk = Array.from(content.slice(start, start + chunkSize));
      let res = await actor.uploadFileChunk(
        puiblishingId,
        fileId,
        BigInt(i),
        chunk,
      );
      if ("err" in res) {
        console.log(chalk.red("Error: ") + res.err);
        process.exit(1);
      }
    }
  });

  fs.rmSync(path.join(rootDir, ".mops/.docs"), {
    force: true,
    recursive: true,
  });

  // finish
  progress();
  logUpdate.done();

  let res = await actor.finishPublish(puiblishingId);
  if ("err" in res) {
    console.log(chalk.red("Error: ") + res.err);
    process.exit(1);
  }

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

async function fetchGitHubReleaseNotes(
  repo: string,
  version: string,
): Promise<string> {
  let repoPath = new URL(repo).pathname;
  let res = await fetch(
    `https://api.github.com/repos${repoPath}/releases/tags/${version}`,
  );
  let release = await res.json();

  if (release.message === "Not Found") {
    res = await fetch(
      `https://api.github.com/repos${repoPath}/releases/tags/v${version}`,
    );
    release = await res.json();

    if (release.message === "Not Found") {
      console.log(
        chalk.yellow(
          `No GitHub release found with name ${version} or v${version}`,
        ),
      );
      return "";
    }
  }

  return release.body;
}
