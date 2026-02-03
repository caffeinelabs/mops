import process from "node:process";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { PassThrough } from "node:stream";

import chalk from "chalk";
import { globSync } from "glob";
import chokidar from "chokidar";
import debounce from "debounce";
import { SemVer } from "semver";
import { ActorMethod } from "@icp-sdk/core/agent";

import { sources } from "../sources.js";
import { getRootDir, readConfig } from "../../mops.js";
import { parallel } from "../../parallel.js";

import { MMF1 } from "./mmf1.js";
import {
  absToRel,
  pipeMMF,
  pipeStderrToMMF,
  pipeStdoutToMMF,
} from "./utils.js";
import { Reporter } from "./reporters/reporter.js";
import { VerboseReporter } from "./reporters/verbose-reporter.js";
import { FilesReporter } from "./reporters/files-reporter.js";
import { CompactReporter } from "./reporters/compact-reporter.js";
import { SilentReporter } from "./reporters/silent-reporter.js";
import { toolchain } from "../toolchain/index.js";
import { Replica } from "../replica.js";
import { TestMode } from "../../types.js";
import { getDfxVersion } from "../../helpers/get-dfx-version.js";
import { MOTOKO_GLOB_CONFIG, MOTOKO_IGNORE_PATTERNS } from "../../constants.js";

type ReporterName = "verbose" | "files" | "compact" | "silent";
type ReplicaName = "dfx" | "pocket-ic" | "dfx-pocket-ic";

type TestOptions = {
  watch: boolean;
  reporter: ReporterName;
  mode: TestMode;
  replica: ReplicaName;
  verbose: boolean;
};

let replica = new Replica();
let replicaStartPromise: Promise<void> | undefined;

async function startReplicaOnce(replica: Replica, type: ReplicaName) {
  if (!replicaStartPromise) {
    replicaStartPromise = new Promise((resolve) => {
      replica.start({ type, silent: true }).then(resolve);
    });
  }
  return replicaStartPromise;
}

export async function test(filter = "", options: Partial<TestOptions> = {}) {
  let config = readConfig();
  let rootDir = getRootDir();

  let replicaType =
    options.replica ??
    (config.toolchain?.["pocket-ic"] ? "pocket-ic" : ("dfx" as ReplicaName));

  if (replicaType === "pocket-ic" && !config.toolchain?.["pocket-ic"]) {
    let dfxVersion = getDfxVersion();
    if (!dfxVersion || new SemVer(dfxVersion).compare("0.24.1") < 0) {
      console.log(
        chalk.red(
          "Please update dfx to the version >=0.24.1 or specify pocket-ic version in mops.toml",
        ),
      );
      process.exit(1);
    } else {
      replicaType = "dfx-pocket-ic";
    }
  }

  replica.type = replicaType;
  replica.verbose = !!options.verbose;

  if (options.watch) {
    replica.ttl = 60 * 15; // 15 minutes

    let sigint = false;
    process.on("SIGINT", () => {
      if (sigint) {
        console.log("Force exit");
        process.exit(0);
      }
      sigint = true;

      if (replicaStartPromise) {
        console.log("Stopping replica...");
        replica.stop(true).then(() => {
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    });

    // todo: run only changed for *.test.mo?
    // todo: run all for *.mo?

    let curRun = Promise.resolve(true);
    let controller = new AbortController();

    let run = debounce(async () => {
      controller.abort();
      await curRun;

      console.clear();
      process.stdout.write("\x1Bc");

      controller = new AbortController();
      curRun = runAll(
        options.reporter,
        filter,
        options.mode,
        replicaType,
        true,
        controller.signal,
      );
      await curRun;

      console.log("-".repeat(50));
      console.log("Waiting for file changes...");
      console.log(chalk.gray(`Press ${chalk.gray("Ctrl+C")} to exit.`));
    }, 200);

    let watcher = chokidar.watch(
      [path.join(rootDir, "**/*.mo"), path.join(rootDir, "mops.toml")],
      {
        ignored: MOTOKO_IGNORE_PATTERNS,
        ignoreInitial: true,
      },
    );

    watcher.on("all", () => {
      run();
    });
    run();
  } else {
    let passed = await runAll(
      options.reporter,
      filter,
      options.mode,
      replicaType,
    );
    if (!passed) {
      process.exit(1);
    }
  }
}

let mocPath = "";
let wasmtimePath = "";

async function runAll(
  reporterName: ReporterName | undefined,
  filter = "",
  mode: TestMode = "interpreter",
  replicaType: ReplicaName,
  watch = false,
  signal?: AbortSignal,
): Promise<boolean> {
  let done = await testWithReporter(
    reporterName,
    filter,
    mode,
    replicaType,
    watch,
    signal,
  );
  return done;
}

export async function testWithReporter(
  reporterName: ReporterName | Reporter | undefined,
  filter = "",
  defaultMode: TestMode = "interpreter",
  replicaType: ReplicaName,
  watch = false,
  signal?: AbortSignal,
): Promise<boolean> {
  let rootDir = getRootDir();
  let files: string[] = [];
  let libFiles = globSync("**/test?(s)/lib.mo", MOTOKO_GLOB_CONFIG);
  if (libFiles[0]) {
    files = [libFiles[0]];
  } else {
    let globStr = filter
      ? `**/test?(s)/**/*${filter}*.mo`
      : "**/test?(s)/**/*.test.mo";
    files = globSync(path.join(rootDir, globStr), MOTOKO_GLOB_CONFIG);
  }
  if (!files.length) {
    if (filter) {
      console.log(`No test files found for filter '${filter}'`);
      return false;
    }
    console.log("No test files found");
    console.log("Put your tests in 'test' directory in *.test.mo files");
    return false;
  }

  let reporter: Reporter;

  if (!reporterName || typeof reporterName === "string") {
    if (!reporterName) {
      reporterName = files.length > 1 ? "files" : "verbose";
    }

    if (reporterName == "compact") {
      reporter = new CompactReporter();
    } else if (reporterName == "files") {
      reporter = new FilesReporter();
    } else if (reporterName == "silent") {
      reporter = new SilentReporter();
    } else {
      reporter = new VerboseReporter();
    }
  } else {
    reporter = reporterName;
  }

  reporter.addFiles(files);

  let config = readConfig();
  let sourcesArr = await sources();

  if (!mocPath) {
    mocPath = await toolchain.bin("moc", { fallback: true });
  }

  let testTempDir = path.join(getRootDir(), ".mops/.test/");
  replica.dir = testTempDir;

  fs.rmSync(testTempDir, { recursive: true, force: true });
  fs.mkdirSync(testTempDir, { recursive: true });

  let filesWithMode = files.map((file) => {
    let lines = fs.readFileSync(file, "utf8").split("\n");
    let mode = defaultMode;
    if (lines.includes("// @testmode wasi")) {
      mode = "wasi";
    } else if (
      lines.includes("// @testmode replica") ||
      lines.find((line) => line.match(/^(persistent )?actor( class)?/))
    ) {
      mode = "replica";
    }
    return { file, mode };
  });

  let hasWasiTests = filesWithMode.some(({ mode }) => mode === "wasi");
  let hasReplicaTests = filesWithMode.some(({ mode }) => mode === "replica");

  // prepare wasmtime path
  if (hasWasiTests && !wasmtimePath) {
    // ensure wasmtime is installed or specified in config
    if (config.toolchain?.wasmtime) {
      wasmtimePath = await toolchain.bin("wasmtime");
    }
    // fallback wasmtime to global binary if not specified in config (legacy)
    else {
      wasmtimePath = "wasmtime";
      console.log(
        chalk.yellow("Warning:"),
        'Wasmtime is not specified in config. Using global binary "wasmtime". This will be removed in the future.',
      );
      console.log(
        `Run ${chalk.green("mops toolchain use wasmtime")} or add ${chalk.green('wasmtime = "<version>"')} in mops.toml to avoid breaking changes with future versions of mops.`,
      );
    }
  }

  let runTestFile = async ({
    file,
    mode,
  }: {
    file: string;
    mode: TestMode;
  }) => {
    if (signal?.aborted) {
      return;
    }

    // print logs immediately for replica tests because we run them one-by-one
    let mmf = new MMF1(mode === "replica" ? "print" : "store", absToRel(file));

    let promise = new Promise<void>((resolve) => {
      let mocArgs = [
        "--hide-warnings",
        "--error-detail=2",
        ...sourcesArr.join(" ").split(" "),
        file,
      ].filter((x) => x);

      // interpret
      if (mode === "interpreter") {
        let proc = spawn(mocPath, ["-r", "-ref-system-api", ...mocArgs], {
          signal,
        });
        proc.addListener("error", (error: any) => {
          if (error?.code === "ABORT_ERR") {
            return;
          }
          throw error;
        });
        pipeMMF(proc, mmf).then(resolve);
      }
      // build and run wasm
      else if (mode === "wasi") {
        let wasmFile = `${path.join(testTempDir, path.parse(file).name)}.wasm`;

        // build
        let buildProc = spawn(
          mocPath,
          [`-o=${wasmFile}`, "-wasi-system-api", ...mocArgs],
          { signal },
        );
        buildProc.addListener("error", (error: any) => {
          if (error?.code === "ABORT_ERR") {
            return;
          }
          throw error;
        });
        pipeMMF(buildProc, mmf)
          .then(async () => {
            if (mmf.failed > 0) {
              return;
            }
            // run
            let wasmtimeArgs = [];
            if (
              config.toolchain?.wasmtime &&
              config.toolchain?.wasmtime >= "14.0.0"
            ) {
              wasmtimeArgs = [
                "-S",
                "preview2=n",
                "-C",
                "cache=n",
                "-W",
                "bulk-memory",
                "-W",
                "multi-memory",
                "-W",
                "memory64",
                "-W",
                "max-wasm-stack=4000000",
                "-W",
                "nan-canonicalization=y",
                wasmFile,
              ];
            } else {
              console.error(
                chalk.red(
                  "Minimum wasmtime version is 14.0.0. Please update wasmtime to the latest version",
                ),
              );
              process.exit(1);
            }

            let proc = spawn(wasmtimePath, wasmtimeArgs, { signal });
            proc.addListener("error", (error: any) => {
              if (error?.code === "ABORT_ERR") {
                return;
              }
              throw error;
            });

            await pipeMMF(proc, mmf);
          })
          .finally(() => {
            fs.rmSync(wasmFile, { force: true });
          })
          .then(resolve);
      }
      // build and execute in replica
      else if (mode === "replica") {
        let wasmFile = `${path.join(testTempDir, path.parse(file).name)}.wasm`;

        // build
        let buildProc = spawn(mocPath, [`-o=${wasmFile}`, ...mocArgs], {
          signal,
        });
        buildProc.addListener("error", (error: any) => {
          if (error?.code === "ABORT_ERR") {
            return;
          }
          throw error;
        });

        pipeMMF(buildProc, mmf)
          .then(async () => {
            if (mmf.failed > 0) {
              return;
            }

            await startReplicaOnce(replica, replicaType);

            if (signal?.aborted) {
              return;
            }

            let canisterName = path.parse(file).name;
            let idlFactory = ({ IDL }: any) => {
              return IDL.Service({ runTests: IDL.Func([], [], []) });
            };
            interface _SERVICE {
              runTests: ActorMethod<[], undefined>;
            }

            let canister = await replica.deploy(
              canisterName,
              wasmFile,
              idlFactory,
              undefined,
              signal,
            );

            if (signal?.aborted || !canister) {
              return;
            }

            pipeStdoutToMMF(canister.stream, mmf);

            let actor = (await replica.getActor(canisterName)) as _SERVICE;

            try {
              if (globalThis.mopsReplicaTestRunning) {
                await new Promise<void>((resolve) => {
                  let timerId = setInterval(
                    () => {
                      if (!globalThis.mopsReplicaTestRunning) {
                        resolve();
                        clearInterval(timerId);
                      }
                    },
                    (Math.random() * 1000) | 0,
                  );
                });
              }

              if (signal?.aborted) {
                return;
              }

              globalThis.mopsReplicaTestRunning = true;
              await actor.runTests();
              globalThis.mopsReplicaTestRunning = false;

              mmf.pass();
            } catch (e: any) {
              let stderrStream = new PassThrough();
              pipeStderrToMMF(stderrStream, mmf, path.dirname(file));
              stderrStream.write(e.message);
            }
          })
          .finally(async () => {
            globalThis.mopsReplicaTestRunning = false;
            fs.rmSync(wasmFile, { force: true });
          })
          .then(resolve);
      }
    });

    if (signal?.aborted) {
      return;
    }

    reporter.addRun(file, mmf, promise, mode);

    await promise;
  };

  await parallel(
    os.cpus().length,
    filesWithMode.filter(({ mode }) => mode !== "replica"),
    runTestFile,
  );
  await parallel(
    1,
    filesWithMode.filter(({ mode }) => mode === "replica"),
    runTestFile,
  );

  if (hasReplicaTests && !watch) {
    await replica.stop();
    fs.rmSync(testTempDir, { recursive: true, force: true });
  }

  if (signal?.aborted) {
    return false;
  }

  return reporter.done();
}
