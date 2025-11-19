import { Argument, Command, Option } from "commander";
import events from "node:events";
import fs from "node:fs";
import process from "node:process";

import { resolve } from "node:path";
import { getNetwork } from "./api/network.js";
import { cacheSize, cleanCache, show } from "./cache.js";
import { add } from "./commands/add.js";
import { bench } from "./commands/bench.js";
import { build, DEFAULT_BUILD_OUTPUT_DIR } from "./commands/build.js";
import { bump } from "./commands/bump.js";
import { checkCandid } from "./commands/check-candid.js";
import { docsCoverage } from "./commands/docs-coverage.js";
import { docs } from "./commands/docs.js";
import { format } from "./commands/format.js";
import { init } from "./commands/init.js";
import { installAll } from "./commands/install/install-all.js";
import {
  addMaintainer,
  printMaintainers,
  removeMaintainer,
} from "./commands/maintainer.js";
import { outdated } from "./commands/outdated.js";
import { addOwner, printOwners, removeOwner } from "./commands/owner.js";
import { publish } from "./commands/publish.js";
import { remove } from "./commands/remove.js";
import { search } from "./commands/search.js";
import * as self from "./commands/self.js";
import { sources } from "./commands/sources.js";
import { sync } from "./commands/sync.js";
import { template } from "./commands/template.js";
import { test } from "./commands/test/test.js";
import { toolchain } from "./commands/toolchain/index.js";
import { update } from "./commands/update.js";
import {
  getPrincipal,
  getUserProp,
  importPem,
  setUserProp,
} from "./commands/user.js";
import { watch } from "./commands/watch/watch.js";
import {
  apiVersion,
  checkApiCompatibility,
  checkConfigFile,
  getNetworkFile,
  setNetwork,
  version,
} from "./mops.js";
import { resolvePackages } from "./resolve-packages.js";
import { Tool } from "./types.js";

declare global {
  // eslint-disable-next-line no-var
  var MOPS_NETWORK: string;
  // eslint-disable-next-line no-var
  var mopsReplicaTestRunning: boolean;
}

events.setMaxListeners(20);

// Change working directory for `npm run mops`
let cwd = process.env["MOPS_CWD"];
if (cwd) {
  process.chdir(resolve(cwd));
}

let networkFile = getNetworkFile();
if (fs.existsSync(networkFile)) {
  globalThis.MOPS_NETWORK = fs.readFileSync(networkFile).toString() || "ic";
}

let program = new Command();

program.name("mops");

// --version
program.version(`CLI ${version()}\nAPI ${apiVersion}`, "-v --version");

// init
program
  .command("init")
  .description("Initialize a new project or package in the current directory")
  .option("-y, --yes", "Accept all defaults")
  .action(async (options) => {
    await init(options);
  });

// add
program
  .command("add <pkg>")
  .description("Install the package and save it to mops.toml")
  .option("--dev", "Add to [dev-dependencies] section")
  .option("--verbose")
  .addOption(
    new Option("--lock <action>", "Lockfile action").choices([
      "update",
      "ignore",
    ]),
  )
  .action(async (pkg, options) => {
    if (!checkConfigFile()) {
      process.exit(1);
    }
    await add(pkg, options);
  });

// remove
program
  .command("remove <pkg>")
  .alias("rm")
  .description("Remove package and update mops.toml")
  .option("--dev", "Remove from dev-dependencies instead of dependencies")
  .option("--verbose", "Show more information")
  .option("--dry-run", "Do not actually remove anything")
  .addOption(
    new Option("--lock <action>", "Lockfile action").choices([
      "update",
      "ignore",
    ]),
  )
  .action(async (pkg, options) => {
    if (!checkConfigFile()) {
      process.exit(1);
    }
    await remove(pkg, options);
  });

// install
program
  .command("install")
  .alias("i")
  .description("Install all dependencies specified in mops.toml")
  .option("--no-toolchain", "Do not install toolchain")
  .option("--verbose")
  .addOption(
    new Option("--lock <action>", "Lockfile action").choices([
      "check",
      "update",
      "ignore",
    ]),
  )
  .action(async (options) => {
    if (!checkConfigFile()) {
      process.exit(1);
    }

    let compatible = await checkApiCompatibility();
    if (!compatible) {
      return;
    }

    if (options.toolchain) {
      await toolchain.ensureToolchainInited({ strict: false });
    }

    let ok = await installAll(options);

    if (options.toolchain) {
      await toolchain.installAll(options);
    }

    // check conflicts
    await resolvePackages({ conflicts: "warning" });

    if (!ok) {
      process.exit(1);
    }
  });

// publish
program
  .command("publish")
  .description("Publish package to the mops registry")
  .option("--no-docs", "Do not generate docs")
  .option("--no-test", "Do not run tests")
  .option("--no-bench", "Do not run benchmarks")
  .option("--verbose")
  .action(async (options) => {
    if (!checkConfigFile()) {
      process.exit(1);
    }
    let compatible = await checkApiCompatibility();
    if (compatible) {
      await publish(options);
    }
  });

// set-network
program
  .command("set-network <network>")
  .alias("sn")
  .description("Set network local|staging|ic")
  .action(async (network) => {
    await setNetwork(network);
    console.log(`Selected '${network}' network`);
  });

// get-network
program
  .command("get-network")
  .alias("gn")
  .description("Get network")
  .action(async () => {
    console.log(getNetwork());
  });

// sources
program
  .command("sources")
  .description("for dfx packtool")
  .option("--no-install", "Do not install dependencies before running sources")
  .addOption(
    new Option(
      "--conflicts <action>",
      "What to do with dependency version conflicts",
    )
      .choices(["ignore", "warning", "error"])
      .default("warning"),
  )
  .action(async (options) => {
    if (!checkConfigFile()) {
      process.exit(1);
    }
    if (options.install) {
      await installAll({
        silent: true,
        lock: "ignore",
        threads: 6,
        installFromLockFile: true,
      });
    }
    await toolchain.ensureToolchainInited({ strict: false });
    let sourcesArr = await sources(options);
    console.log(sourcesArr.join("\n"));
  });

// search
program
  .command("search <text>")
  .description("Search for packages")
  .action(async (text) => {
    await search(text);
  });

// cache
program
  .command("cache")
  .description("Manage cache")
  .addArgument(new Argument("<sub>").choices(["size", "clean", "show"]))
  .action(async (sub) => {
    if (sub == "clean") {
      await cleanCache();
      console.log("Cache cleaned");
    } else if (sub == "size") {
      let size = await cacheSize();
      console.log("Cache size is " + size);
    } else if (sub == "show") {
      console.log(show());
    }
  });

// build
program
  .command("build [canisters...]")
  .description("Build a canister")
  .addOption(new Option("--verbose", "Verbose console output"))
  .addOption(
    new Option("--output, -o <output>", "Output directory").default(
      DEFAULT_BUILD_OUTPUT_DIR,
    ),
  )
  .allowUnknownOption(true) // TODO: restrict unknown before "--"
  .action(async (canisters, options, command) => {
    checkConfigFile(true);
    const extraArgsIndex = command.args.indexOf("--");
    await installAll({
      silent: true,
      lock: "ignore",
      installFromLockFile: true,
    });
    await build(canisters.length ? canisters : undefined, {
      ...options,
      extraArgs:
        extraArgsIndex !== -1 ? command.args.slice(extraArgsIndex + 1) : [],
    });
  });

// check-candid
program
  .command("check-candid <new-candid> <original-candid>")
  .description("Check Candid interface compatibility between two Candid files")
  .action(async (newCandid, originalCandid) => {
    checkConfigFile(true);
    await installAll({
      silent: true,
      lock: "ignore",
      installFromLockFile: true,
    });
    await checkCandid(newCandid, originalCandid);
  });

// test
program
  .command("test [filter]")
  .description("Run tests")
  .addOption(
    new Option("-r, --reporter <reporter>", "Test reporter").choices([
      "verbose",
      "compact",
      "files",
      "silent",
    ]),
  )
  .addOption(
    new Option("--mode <mode>", "Test mode")
      .choices(["interpreter", "wasi", "replica"])
      .default("interpreter"),
  )
  .addOption(
    new Option(
      "--replica <replica>",
      "Which replica to use to run tests in replica mode",
    ).choices(["dfx", "pocket-ic"]),
  )
  .option("-w, --watch", "Enable watch mode")
  .option("--verbose", "Verbose output")
  .action(async (filter, options) => {
    checkConfigFile(true);
    await installAll({
      silent: true,
      lock: "ignore",
      installFromLockFile: true,
    });
    await test(filter, options);
  });

// bench
program
  .command("bench [filter]")
  .description("Run benchmarks")
  .addOption(
    new Option(
      "--replica <replica>",
      "Which replica to use to run benchmarks",
    ).choices(["dfx", "pocket-ic"]),
  )
  .addOption(
    new Option("--gc <gc>", "Garbage collector")
      .choices(["copying", "compacting", "generational", "incremental"])
      .default("copying"),
  )
  .addOption(
    new Option("--save", "Save benchmark results to .bench/<filename>.json"),
  )
  .addOption(
    new Option(
      "--compare",
      "Run benchmark and compare results with .bench/<filename>.json",
    ),
  )
  // .addOption(new Option('--force-gc', 'Force GC'))
  .addOption(new Option("--verbose", "Show more information"))
  .action(async (filter, options) => {
    checkConfigFile(true);
    await installAll({
      silent: true,
      lock: "ignore",
      installFromLockFile: true,
    });
    await bench(filter, options);
  });

// template
program
  .command("template")
  .description("Apply template")
  .action(async () => {
    if (!checkConfigFile()) {
      process.exit(1);
    }
    await template();
  });

// mops user *
const userCommand = new Command("user").description("User management");

// user get-principal
userCommand
  .command("get-principal")
  .description("Print your principal")
  .action(async () => {
    await getPrincipal();
  });

// user import
userCommand
  .command("import <data>")
  .description("Import .pem file data to use as identity")
  .addOption(
    new Option("--no-encrypt", "Do not ask for a password to encrypt identity"),
  )
  .action(async (data, options) => {
    await importPem(data, options);
    await getPrincipal();
  });

// user set <prop> <value>
userCommand
  .command("set")
  .addArgument(
    new Argument("<prop>").choices([
      "name",
      "site",
      "email",
      "github",
      "twitter",
    ]),
  )
  .addArgument(new Argument("<value>"))
  .description("Set user property")
  .action(async (prop, value) => {
    await setUserProp(prop, value);
  });

// user get <prop>
userCommand
  .command("get")
  .addArgument(
    new Argument("<prop>").choices([
      "name",
      "site",
      "email",
      "github",
      "twitter",
    ]),
  )
  .description("Get user property")
  .action(async (prop) => {
    await getUserProp(prop);
  });

program.addCommand(userCommand);

// mops owner *
const ownerCommand = new Command("owner").description(
  "Package owner management",
);

// mops owner list
ownerCommand
  .command("list")
  .description("List package owners")
  .action(async () => {
    await printOwners();
  });

// mops owner add
ownerCommand
  .command("add <principal>")
  .description("Add package owner")
  .addOption(new Option("--yes", "Do not ask for confirmation"))
  .action(async (data, options) => {
    await addOwner(data, options.yes);
  });

// mops owner remove
ownerCommand
  .command("remove <principal>")
  .description("Remove package owner")
  .addOption(new Option("--yes", "Do not ask for confirmation"))
  .action(async (data, options) => {
    await removeOwner(data, options.yes);
  });

program.addCommand(ownerCommand);

// mops maintainer *
const maintainerCommand = new Command("maintainer").description(
  "Package maintainer management",
);

// mops maintainer list
maintainerCommand
  .command("list")
  .description("List package maintainers")
  .action(async () => {
    await printMaintainers();
  });

// mops maintainer add
maintainerCommand
  .command("add <principal>")
  .description("Add package maintainer")
  .addOption(new Option("--yes", "Do not ask for confirmation"))
  .action(async (data, options) => {
    await addMaintainer(data, options.yes);
  });

// mops maintainer remove
maintainerCommand
  .command("remove <principal>")
  .description("Remove package maintainer")
  .addOption(new Option("--yes", "Do not ask for confirmation"))
  .action(async (data, options) => {
    await removeMaintainer(data, options.yes);
  });

program.addCommand(maintainerCommand);

// bump
program
  .command("bump [major|minor|patch]")
  .description("Bump current package version")
  .action(async (part) => {
    await bump(part);
  });

// sync
program
  .command("sync")
  .description("Add missing packages and remove unused packages")
  .addOption(
    new Option("--lock <action>", "Lockfile action").choices([
      "update",
      "ignore",
    ]),
  )
  .action(async (options) => {
    await sync(options);
  });

// outdated
program
  .command("outdated")
  .description("Print outdated dependencies specified in mops.toml")
  .action(async () => {
    await outdated();
  });

// update
program
  .command("update [pkg]")
  .description("Update dependencies specified in mops.toml")
  .addOption(
    new Option("--lock <action>", "Lockfile action").choices([
      "update",
      "ignore",
    ]),
  )
  .action(async (pkg, options) => {
    await update(pkg, options);
  });

// toolchain
const toolchainCommand = new Command("toolchain").description(
  "Toolchain management",
);

toolchainCommand
  .command("init")
  .description("One-time initialization of toolchain management")
  .action(async () => {
    await toolchain.init();
  });

toolchainCommand
  .command("reset")
  .description("Uninstall toolchain management")
  .action(async () => {
    await toolchain.init({ reset: true });
  });

toolchainCommand
  .command("use")
  .description("Install specified tool version and update mops.toml")
  .addArgument(new Argument("<tool>").choices(["moc", "wasmtime", "pocket-ic"]))
  .addArgument(new Argument("[version]"))
  .action(async (tool, version) => {
    if (!checkConfigFile()) {
      process.exit(1);
    }
    await toolchain.use(tool, version);
  });

toolchainCommand
  .command("update")
  .description(
    "Update specified tool or all tools to the latest version and update mops.toml",
  )
  .addArgument(new Argument("[tool]").choices(["moc", "wasmtime", "pocket-ic"]))
  .action(async (tool?: Tool) => {
    if (!checkConfigFile()) {
      process.exit(1);
    }
    await toolchain.update(tool);
  });

toolchainCommand
  .command("bin")
  .description(
    'Get path to the tool binary\n<tool> can be one of "moc", "wasmtime", "pocket-ic"',
  )
  .addArgument(new Argument("<tool>").choices(["moc", "wasmtime", "pocket-ic"]))
  .addOption(
    new Option(
      "--fallback",
      "Fallback to the moc that comes with dfx if moc is not specified in the [toolchain] section",
    ),
  )
  .action(async (tool, options) => {
    let bin = await toolchain.bin(tool, options);
    console.log(bin);
  });

program.addCommand(toolchainCommand);

// self
const selfCommand = new Command("self").description("Mops CLI management");

selfCommand
  .command("update")
  .description("Update mops CLI to the latest version")
  .action(async () => {
    await self.update();
  });

selfCommand
  .command("uninstall")
  .description("Uninstall mops CLI")
  .action(async () => {
    await self.uninstall();
  });

program.addCommand(selfCommand);

// watch
program
  .command("watch")
  .description(
    "Watch *.mo files and check for syntax errors, warnings, run tests, generate declarations and deploy canisters",
  )
  .option(
    "-e, --error",
    "Check Motoko canisters or *.mo files for syntax errors",
  )
  .option("-w, --warning", "Check Motoko canisters or *.mo files for warnings")
  .option("-f, --format", "Format Motoko code")
  .option("-t, --test", "Run tests")
  .option("-g, --generate", "Generate declarations for Motoko canisters")
  .option("-d, --deploy", "Deploy Motoko canisters")
  .action(async (options) => {
    checkConfigFile(true);
    await watch(options);
  });

// format
program
  .command("format [filter]")
  .alias("fmt")
  .description("Format Motoko code")
  .addOption(
    new Option("--check", "Check code formatting (do not change source files)"),
  )
  .action(async (filter, options) => {
    checkConfigFile(true);
    let { ok } = await format(filter, options);
    if (!ok) {
      process.exit(1);
    }
  });

// docs
const docsCommand = new Command("docs").description("Documentation management");

docsCommand
  .command("generate")
  .description("Generate documentation for Motoko code")
  .addOption(new Option("--source <source>", "Source directory").default("src"))
  .addOption(
    new Option("--output, -o <output>", "Output directory").default("docs"),
  )
  .addOption(
    new Option("--format <format>", "Output format")
      .default("md")
      .choices(["md", "adoc", "html"]),
  )
  .action(async (options) => {
    checkConfigFile(true);
    await docs(options);
  });

docsCommand
  .command("coverage")
  .description("Documentation coverage report")
  .addOption(
    new Option(
      "-s, --source <source>",
      "Source directory (with .mo files)",
    ).default("src"),
  )
  .addOption(
    new Option("-r, --reporter <reporter>", "Coverage reporter")
      .choices(["files", "compact", "missing", "verbose"])
      .default("files"),
  )
  .addOption(
    new Option(
      "-t, --threshold <threshold>",
      "Coverage threshold (0-100). If total coverage is below threshold, exit with error code 1",
    ).default(70),
  )
  .action(async (options) => {
    checkConfigFile(true);
    await docsCoverage(options);
  });
program.addCommand(docsCommand);

program.parse();
