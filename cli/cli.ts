import { Argument, Command, Option } from "commander";
import chalk from "chalk";
import events from "node:events";
import process from "node:process";

import { resolve } from "node:path";
import { cacheSize, cleanCache, show } from "./cache.js";
import { add } from "./commands/add.js";
import { bench } from "./commands/bench.js";
import { build } from "./commands/build.js";
import { bump } from "./commands/bump.js";
import { check } from "./commands/check.js";
import { checkCandid } from "./commands/check-candid.js";
import { checkStable } from "./commands/check-stable.js";
import { deployed, deployedInit } from "./commands/deployed.js";
import { docsCoverage } from "./commands/docs-coverage.js";
import { docs } from "./commands/docs.js";
import { format } from "./commands/format.js";
import { generateCandid } from "./commands/generate.js";
import { info } from "./commands/info.js";
import { init } from "./commands/init.js";
import { lint } from "./commands/lint.js";
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
import { migrateNew, migrateFreeze } from "./commands/migrate.js";
import { watch } from "./commands/watch/watch.js";
import {
  apiVersion,
  checkApiCompatibility,
  checkConfigFile,
  getGlobalMocArgs,
  readConfig,
  version,
} from "./mops.js";
import { legacyLockOption } from "./legacy-lock-flag.js";
import { setConflictPolicy } from "./resolve-packages.js";
import { verifyIntegrity } from "./integrity.js";
import { Tool } from "./types.js";
import { TOOLCHAINS } from "./commands/toolchain/toolchain-utils.js";

declare global {
  // eslint-disable-next-line no-var
  var mopsReplicaTestRunning: boolean;
}

events.setMaxListeners(20);

// Change working directory for `npm run mops`
let cwd = process.env["MOPS_CWD"];
if (cwd) {
  process.chdir(resolve(cwd));
}

let program = new Command();

function parseExtraArgs(variadicArgs?: string[]): {
  extraArgs: string[];
  args: string[];
} {
  const rawArgs = process.argv.slice(2);
  const dashDashIndex = rawArgs.indexOf("--");
  const extraArgs =
    dashDashIndex !== -1 ? rawArgs.slice(dashDashIndex + 1) : [];
  const args = variadicArgs
    ? extraArgs.length > 0
      ? variadicArgs.slice(0, variadicArgs.length - extraArgs.length)
      : variadicArgs
    : [];
  return { extraArgs, args };
}

// Implicit install for build/check/test/bench/generate. Exits on failure:
// a download that fails its integrity check, or any other install error, must
// not let the command carry on against a half-populated `.mops/`.
async function installAllOrExit(options: { locked?: boolean }): Promise<void> {
  let ok = await installAll({
    silent: true,
    lock: options.locked ? "locked" : "maintain",
  });
  if (!ok) {
    process.exit(1);
  }
}

// Shared `--help` section describing the enhanced migration `check-limit`
// trimming and its override flag, so the limit behaviour is discoverable
// from `--help`. `withFix` appends the `--fix` hint for commands that support it.
// `withPendingWarning` adds the stable-check pending-migration warning (check / check-stable only).
function enhancedMigrationHelp(
  options: {
    withFix?: boolean;
    withPendingWarning?: boolean;
  } = {},
): string {
  const example = options.withFix ? " (e.g. to --fix older migrations)" : "";
  let text =
    "\nEnhanced migration ([canisters.<name>.migrations]):\n" +
    "  The canister is checked against its migration chain. [migrations].check-limit\n" +
    "  trims it to the last N migrations (older ones are skipped). Pass --no-check-limit\n" +
    `  to use the full chain${example}.`;
  if (options.withPendingWarning) {
    text +=
      "\n  When check-limit is set, the stable check reports if more migrations are pending\n" +
      "  (relative to the deployed .most baseline) than the limit allows — as an error if\n" +
      "  compat failed, otherwise a warning.";
  }
  return text;
}

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
  .option("--verbose", "Show more information")
  .addOption(legacyLockOption())
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
  .addOption(legacyLockOption())
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
  .option("--verbose", "Show more information")
  .addOption(
    new Option(
      "--locked",
      "Require an up-to-date mops.lock and never write it; fails if the lock is missing, stale, or disagrees with mops.toml or the registry (use in CI)",
    ),
  )
  .addOption(legacyLockOption())
  .action(async (options) => {
    if (!checkConfigFile()) {
      process.exit(1);
    }

    let compatible = await checkApiCompatibility();
    if (!compatible) {
      return;
    }

    let ok = await installAll({
      ...options,
      lock: options.locked ? "locked" : "maintain",
    });

    // Bail before the conflicts check: it re-resolves, which reads dependency
    // manifests that a failed install may never have written.
    if (!ok) {
      process.exit(1);
    }

    if (options.toolchain) {
      await toolchain.installAll(options);
    }

    // No explicit conflict check: installAll resolves, and resolution reports
    // conflicts on its own now instead of waiting for a caller to opt in.
  });

// verify
program
  .command("verify")
  .description(
    "Audit installed dependencies against mops.lock: re-hash every file under .mops/ and confirm the lock still matches mops.toml and the registry",
  )
  .action(async () => {
    checkConfigFile(true);
    let result = await verifyIntegrity();
    if (result.errors.length) {
      console.error(chalk.red("Integrity check failed"));
      for (let line of result.errors) {
        console.error(line);
      }
      process.exit(1);
    }
    console.log(
      chalk.green("Integrity verified ") +
        `${result.packages} package(s), ${result.files} file(s)`,
    );
  });

// publish
program
  .command("publish")
  .description("Publish package to the mops registry")
  .option("--no-docs", "Do not generate docs")
  .option("--no-test", "Do not run tests")
  .option("--no-bench", "Do not run benchmarks")
  .option(
    "--dry-run",
    "Run local publish steps without contacting the registry or uploading",
  )
  .option("--verbose", "Show more information")
  .action(async (options) => {
    if (!checkConfigFile()) {
      process.exit(1);
    }
    // dry-run is local-only — skip registry API compatibility check
    if (options.dryRun) {
      await publish(options);
      return;
    }
    let compatible = await checkApiCompatibility();
    if (compatible) {
      await publish(options);
    }
  });

// sources
program
  .command("sources")
  .description(
    "Print the resolved dependencies as `--package` flags for the Motoko compiler",
  )
  .option("--no-install", "Do not install dependencies before running sources")
  .addOption(
    new Option(
      "--conflicts <action>",
      "What to do with cross-major dependency version conflicts (reported on stderr)",
    )
      .choices(["ignore", "warning", "error"])
      .default("warning"),
  )
  .action(async (options) => {
    if (!checkConfigFile()) {
      process.exit(1);
    }
    // Before installAll: that resolves too, and --conflicts governs the whole
    // command, not just the final resolve that produces the sources.
    setConflictPolicy(options.conflicts);
    if (options.install) {
      // `mops sources` stdout is machine-parsed, so it must not write the lock
      // or print integrity output — hence `lock: "skip"`. It has no `--locked`:
      // enforce the lock with a preceding `mops install --locked` step instead
      // of failing in the middle of whatever build invoked it.
      await installAll({ silent: true, lock: "skip", threads: 6 });
    }
    let sourcesArr = await sources(options);
    console.log(sourcesArr.join("\n"));
  });

// moc-args
program
  .command("moc-args")
  .description("Print global moc compiler flags from [moc] config section")
  .action(async () => {
    checkConfigFile(true);
    let config = readConfig();
    let args = getGlobalMocArgs(config);
    if (args.length) {
      console.log(args.join("\n"));
    }
  });

// search
program
  .command("search <text>")
  .description("Search for packages")
  .action(async (text) => {
    await search(text);
  });

// info
program
  .command("info <pkg>")
  .description("Show detailed information about a package from the registry")
  .option("--versions", "List all published versions, one per line")
  .action(async (pkg: string, options) => {
    await info(pkg, options);
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
  .addOption(new Option("--output, -o <output>", "Output directory"))
  .addOption(
    new Option(
      "--check-wasm",
      "Analyze the built Wasm for likely IC0505 complexity risks (also enabled by [build].check-wasm)",
    ),
  )
  .addOption(
    new Option(
      "--no-check-wasm",
      "Skip Wasm complexity analysis even when [build].check-wasm is enabled",
    ),
  )
  .addOption(
    new Option(
      "--check-deploy",
      "Install the built Wasm on PocketIC to detect deployment failures (also enabled by [build].check-deploy)",
    ),
  )
  .addOption(
    new Option(
      "--no-check-deploy",
      "Skip PocketIC deployment validation even when [build].check-deploy is enabled",
    ),
  )
  .addOption(
    new Option(
      "--no-optimize",
      "Skip the [optimize] wasm-opt post-pass even when it is configured in mops.toml",
    ),
  )
  .addHelpText(
    "after",
    "\nArguments after -- are forwarded directly to moc, e.g.:\n  $ mops build -- -Werror",
  )
  .addHelpText(
    "after",
    "\nEnhanced migration ([canisters.<name>.migrations]):\n" +
      "  The canister is built against its full migration chain (every migration is\n" +
      "  compiled into the wasm). If mops check passes but mops build fails while\n" +
      "  [migrations].check-limit is set, re-run with mops check --no-check-limit to\n" +
      "  surface the issue (check trims the chain; build compiles all of it).",
  )
  .addOption(
    new Option(
      "--locked",
      "Require an up-to-date mops.lock and never write it; fails if the lock is missing, stale, or disagrees with mops.toml or the registry (use in CI)",
    ),
  )
  .action(async (canisters, options) => {
    checkConfigFile(true);
    const { extraArgs, args } = parseExtraArgs(canisters);
    await installAllOrExit(options);
    await build(args.length ? args : undefined, {
      ...options,
      outputDir: options.output,
      extraArgs,
    });
  });

// check
program
  .command("check [args...]")
  .description(
    "Check Motoko canisters or files for syntax errors and type issues. Arguments can be canister names or file paths. If no arguments are given, checks all canisters from mops.toml. Also runs stable compatibility checks for canisters with [check-stable] configured, and runs linting if lintoko is configured in [toolchain] (pass --no-lint to skip)",
  )
  .option("--verbose", "Verbose console output")
  .addOption(
    new Option(
      "--fix",
      "Apply autofixes to all files, including transitively imported ones",
    ),
  )
  .addOption(
    new Option(
      "--no-lint",
      "Skip linting even when lintoko is pinned in [toolchain]",
    ),
  )
  .addOption(
    new Option(
      "--no-check-limit",
      "Use the full migration chain, ignoring [migrations].check-limit; also suppresses the pending-migration warning",
    ),
  )
  .addHelpText(
    "after",
    "\nArguments after -- are forwarded directly to moc, e.g.:\n  $ mops check -- -Werror",
  )
  .addHelpText(
    "after",
    enhancedMigrationHelp({ withFix: true, withPendingWarning: true }),
  )
  .addOption(
    new Option(
      "--locked",
      "Require an up-to-date mops.lock and never write it; fails if the lock is missing, stale, or disagrees with mops.toml or the registry (use in CI)",
    ),
  )
  .action(async (args, options) => {
    checkConfigFile(true);
    const { extraArgs, args: argList } = parseExtraArgs(args);
    await installAllOrExit(options);
    await check(argList, {
      ...options,
      extraArgs,
    });
  });

// check-candid
program
  .command("check-candid <new-candid> <original-candid>")
  .description("Check Candid interface compatibility between two Candid files")
  .addOption(
    new Option(
      "--locked",
      "Require an up-to-date mops.lock and never write it; fails if the lock is missing, stale, or disagrees with mops.toml or the registry (use in CI)",
    ),
  )
  .action(async (newCandid, originalCandid, options) => {
    checkConfigFile(true);
    await installAllOrExit(options);
    await checkCandid(newCandid, originalCandid);
  });

// check-stable
program
  .command("check-stable [args...]")
  .description(
    "Check stable variable compatibility. With no arguments, checks all canisters with [check-stable] configured. Arguments can be canister names or an old file path followed by an optional canister name",
  )
  .option("--verbose", "Verbose console output")
  .addOption(
    new Option(
      "--no-check-limit",
      "Use the full migration chain, ignoring [migrations].check-limit; also suppresses the pending-migration warning",
    ),
  )
  .addHelpText(
    "after",
    "\nArguments after -- are forwarded directly to moc, e.g.:\n  $ mops check-stable -- -Werror",
  )
  .addHelpText("after", enhancedMigrationHelp({ withPendingWarning: true }))
  .addOption(
    new Option(
      "--locked",
      "Require an up-to-date mops.lock and never write it; fails if the lock is missing, stale, or disagrees with mops.toml or the registry (use in CI)",
    ),
  )
  .action(async (args, options) => {
    checkConfigFile(true);
    const { extraArgs, args: argList } = parseExtraArgs(args);
    await installAllOrExit(options);
    await checkStable(argList, {
      ...options,
      extraArgs,
    });
  });

// deployed
const deployedCommand = new Command("deployed")
  .description(
    "Post-deploy hook: promote .most stable-types files into the deployed directory so `mops check-stable` compares against the just-deployed version. Pass canister names to scope; with no arguments, all canisters in mops.toml are promoted",
  )
  .argument("[canisters...]")
  .addOption(
    new Option(
      "--build-dir <dir>",
      "Directory to read built .most files from (default: [build].outputDir or .mops/.build)",
    ),
  )
  .addOption(
    new Option(
      "--dir <dir>",
      "Destination directory (default: [deployed].dir or deployed)",
    ),
  )
  .action(async (canisters: string[], options) => {
    checkConfigFile(true);
    await deployed(canisters.length ? canisters : undefined, options);
  });

deployedCommand
  .command("init [canisters...]")
  .description(
    "Pre-first-deploy bootstrap: create an empty-actor .most baseline in the deployed directory and wire [canisters.<name>.check-stable].path to it. Idempotent",
  )
  .addOption(
    new Option(
      "--dir <dir>",
      "Destination directory (default: [deployed].dir or deployed)",
    ),
  )
  .action(async (canisters: string[], options) => {
    checkConfigFile(true);
    await deployedInit(canisters.length ? canisters : undefined, options);
  });

program.addCommand(deployedCommand);

// test
program
  .command("test [filter...]")
  .description("Run tests")
  .addOption(
    new Option("-r, --reporter <reporter>", "Test reporter")
      .choices(["verbose", "compact", "files", "silent"])
      .default("verbose"),
  )
  .addOption(
    new Option("--mode <mode>", "Test mode")
      .choices(["interpreter", "wasi", "replica"])
      .default("interpreter"),
  )
  .option("-w, --watch", "Enable watch mode")
  .option("--verbose", "Verbose output")
  .addHelpText(
    "after",
    "\nArguments after -- are forwarded directly to moc, e.g.:\n  $ mops test -- -Werror",
  )
  .addOption(
    new Option(
      "--locked",
      "Require an up-to-date mops.lock and never write it; fails if the lock is missing, stale, or disagrees with mops.toml or the registry (use in CI)",
    ),
  )
  .action(async (filterArr, options) => {
    checkConfigFile(true);
    const { extraArgs, args } = parseExtraArgs(filterArr);
    const filter = args[0] ?? "";
    await installAllOrExit(options);
    await test(filter, { ...options, extraArgs });
  });

// bench
program
  .command("bench [filter...]")
  .description("Run benchmarks")
  .addOption(
    new Option(
      "--gc <gc>",
      "Garbage collector. Under enhanced orthogonal persistence (the default) the GC is fixed to `incremental`; selecting `copying`, `compacting`, or `generational` implies `--legacy-persistence`",
    )
      .choices(["copying", "compacting", "generational", "incremental"])
      .default("incremental"),
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
  .addOption(
    new Option(
      "--query",
      "Measure each cell in a query call (how `query` methods run on the IC: no GC). Only for benchmarks whose runner is synchronous (no inter-canister calls)",
    ),
  )
  .addOption(
    new Option(
      "--legacy-persistence",
      "Compile benchmark canisters under legacy persistence instead of enhanced orthogonal persistence (the default)",
    ),
  )
  .addOption(
    new Option(
      "--verbose",
      "Print the benchmark pipeline (compiler, replica, GC, context, persistence, profile, optimization) and stream compiler and replica output",
    ),
  )
  .addOption(
    new Option(
      "--no-optimize",
      "Skip the [optimize] wasm-opt post-pass even when it is configured in mops.toml",
    ),
  )
  .addHelpText(
    "after",
    "\nArguments after -- are forwarded directly to moc, e.g.:\n  $ mops bench -- -Werror",
  )
  .addOption(
    new Option(
      "--locked",
      "Require an up-to-date mops.lock and never write it; fails if the lock is missing, stale, or disagrees with mops.toml or the registry (use in CI)",
    ),
  )
  .action(async (filterArr, options) => {
    checkConfigFile(true);
    const { extraArgs, args } = parseExtraArgs(filterArr);
    const filter = args[0] ?? "";
    await installAllOrExit(options);
    await bench(filter, { ...options, extraArgs });
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
    if (await importPem(data, options)) {
      await getPrincipal();
    }
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
  .addOption(legacyLockOption())
  .action(async () => {
    await sync();
  });

// outdated
program
  .command("outdated")
  .description(
    "Print outdated dependencies in mops.toml within the caret bound (does not cross major versions, or pre-1.0 minor versions)",
  )
  .addOption(
    new Option(
      "--major",
      "Allow updates that cross the caret bound (major versions, or for 0.x.y packages, minor versions)",
    ).conflicts("patch"),
  )
  .addOption(
    new Option(
      "--patch",
      "Restrict updates to patch versions only (e.g. 1.2.3 -> 1.2.4, never 1.2.3 -> 1.3.0)",
    ),
  )
  .action(async (options) => {
    await outdated(options);
  });

// update
program
  .command("update [pkg]")
  .description(
    "Update dependencies in mops.toml to the highest semver-compatible version within the caret bound (does not cross major versions, or pre-1.0 minor versions)",
  )
  .addOption(
    new Option(
      "--major",
      "Allow updates that cross the caret bound (major versions, or for 0.x.y packages, minor versions)",
    ).conflicts("patch"),
  )
  .addOption(
    new Option(
      "--patch",
      "Restrict updates to patch versions only (e.g. 1.2.3 -> 1.2.4, never 1.2.3 -> 1.3.0)",
    ),
  )
  .addOption(legacyLockOption())
  .action(async (pkg, options) => {
    await update(pkg, options);
  });

// toolchain
const toolchainCommand = new Command("toolchain")
  .description(
    `Toolchain management for ${TOOLCHAINS.map((s) => `"${s}"`).join(", ")}`,
  )
  .showHelpAfterError();

toolchainCommand
  .command("use")
  .description("Install specified tool version and update mops.toml")
  .addArgument(new Argument("<tool>", "tool to install").choices(TOOLCHAINS))
  .addArgument(
    new Argument(
      "[version]",
      "version to install (defaults to interactive picker)",
    ),
  )
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
  .addArgument(
    new Argument(
      "[tool]",
      "tool to update (defaults to all configured tools)",
    ).choices(TOOLCHAINS),
  )
  .action(async (tool?: Tool) => {
    if (!checkConfigFile()) {
      process.exit(1);
    }
    await toolchain.update(tool);
  });

toolchainCommand
  .command("info")
  .description("Show release information about a toolchain tool")
  .addArgument(new Argument("<tool>", "tool to look up").choices(TOOLCHAINS))
  .option(
    "--versions",
    "List stable release versions, one per line (newest first; first GitHub page by default)",
  )
  .option(
    "--all",
    "With --versions, fetch every release page instead of the first page only",
  )
  .action(async (tool: Tool, options) => {
    await toolchain.info(tool, options);
  });

toolchainCommand
  .command("bin")
  .description("Get path to the tool binary")
  .addArgument(new Argument("<tool>", "tool to look up").choices(TOOLCHAINS))
  .action(async (tool) => {
    let bin = await toolchain.bin(tool);
    console.log(bin);
  });

program.addCommand(toolchainCommand);

// migrate
const migrateCommand = new Command("migrate").description(
  "Manage enhanced migration chains",
);

migrateCommand
  .command("new <name> [canister]")
  .description("Create a new migration file in the next-migration directory")
  .action(async (name, canister) => {
    checkConfigFile(true);
    await migrateNew(name, canister);
  });

migrateCommand
  .command("freeze [canister]")
  .description("Move the next migration into the frozen chain")
  .action(async (canister) => {
    checkConfigFile(true);
    await migrateFreeze(canister);
  });

program.addCommand(migrateCommand);

// generate
const generateCommand = new Command("generate")
  .description("Generate source-derived artifacts (Candid, ...)")
  .showHelpAfterError();

generateCommand
  .command("candid [canisters...]")
  .description(
    "(Re)generate the curated `.did` file for one or more canisters from current Motoko source. With no canister names, generates for all canisters in mops.toml. When [canisters.<name>].candid is set, overwrites that file; otherwise writes <name>.did next to `main` and sets the field.",
  )
  .addOption(
    new Option(
      "--output, -o <output>",
      "Write the generated .did to <output> (single-canister only; does not touch mops.toml)",
    ),
  )
  .addOption(new Option("--verbose", "Verbose console output"))
  .addHelpText(
    "after",
    "\nArguments after -- are forwarded directly to moc, e.g.:\n  $ mops generate candid -- -Werror",
  )
  .addOption(
    new Option(
      "--locked",
      "Require an up-to-date mops.lock and never write it; fails if the lock is missing, stale, or disagrees with mops.toml or the registry (use in CI)",
    ),
  )
  .action(async (canisters, options) => {
    checkConfigFile(true);
    const { extraArgs, args } = parseExtraArgs(canisters);
    await installAllOrExit(options);
    await generateCandid(args.length ? args : undefined, {
      ...options,
      extraArgs,
    });
  });

program.addCommand(generateCommand);

// self
const selfCommand = new Command("self").description("Mops CLI management");

selfCommand
  .command("update")
  .description("Update mops CLI to the latest version")
  .option(
    "--major",
    "Allow updating across major versions without confirmation (major releases contain breaking changes)",
  )
  .action(async (options: { major?: boolean }) => {
    await self.update(options);
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
    "Watch *.mo files and check for syntax errors and warnings and format code. Pass flags to run only the selected tasks; --test is opt-in only",
  )
  .option("-e, --error", "Check *.mo files for syntax errors (always on)")
  .option("-w, --warning", "Check *.mo files for warnings (on by default)")
  .option("-f, --format", "Format Motoko code (on by default)")
  .option("-t, --test", "Run tests (opt-in)")
  .addHelpText(
    "after",
    "\nWith no flags, runs the default set: errors, warnings and formatting.\n" +
      "Passing any flag runs only the selected tasks (error checking is always on).\n" +
      "Tests never run unless requested:\n" +
      "  $ mops watch -t     # errors + tests\n" +
      "  $ mops watch -tw    # errors + tests + warnings",
  )
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

// lint
program
  .command("lint [filter...]")
  .description("Lint Motoko code")
  .addOption(new Option("--verbose", "Verbose output"))
  .addOption(new Option("--fix", "Apply fixes"))
  .addOption(
    new Option(
      "-r, --rules <directory...>",
      "Directories containing rules (can be used multiple times)",
    ),
  )
  .addOption(
    new Option(
      "--no-check-limit",
      "Lint the full migration chain, ignoring [migrations].check-limit",
    ),
  )
  .addHelpText(
    "after",
    "\nArguments after -- are forwarded directly to lintoko, e.g.:\n  $ mops lint -- --severity warning",
  )
  .addHelpText("after", enhancedMigrationHelp({ withFix: true }))
  .action(async (filterArr, options) => {
    checkConfigFile(true);
    // Variadic filter only to absorb the `--` passthrough operands (Commander
    // counts them against the declared arity); a single filter is supported.
    const { extraArgs, args } = parseExtraArgs(filterArr);
    await lint(args[0], {
      ...options,
      extraArgs,
      noCheckLimit: options.checkLimit === false,
    });
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
