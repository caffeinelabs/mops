import process from "node:process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import chalk from "chalk";
import { globSync } from "glob";
import { markdownTable } from "markdown-table";
import { createLogUpdate } from "log-update";
import { execaCommand } from "execa";
import stringWidth from "string-width";
import { filesize } from "filesize";
import terminalSize from "terminal-size";
import { SemVer } from "semver";

import { getRootDir, readConfig, readDfxJson } from "../mops.js";
import { parallel } from "../parallel.js";
import { absToRel } from "./test/utils.js";
import { getMocVersion } from "../helpers/get-moc-version.js";
import { getDfxVersion } from "../helpers/get-dfx-version.js";
import { getMocPath } from "../helpers/get-moc-path.js";
import { sources } from "./sources.js";
import { MOTOKO_GLOB_CONFIG } from "../constants.js";

import { Benchmark, Benchmarks } from "../declarations/main/main.did.js";
import { BenchResult, _SERVICE } from "../declarations/bench/bench.did.js";
import { BenchReplica } from "./bench-replica.js";

type ReplicaName = "dfx" | "pocket-ic" | "dfx-pocket-ic";

type BenchOptions = {
  replica: ReplicaName;
  replicaVersion: string;
  compiler: "moc";
  compilerVersion: string;
  gc: "copying" | "compacting" | "generational" | "incremental";
  forceGc: boolean;
  save: boolean;
  compare: boolean;
  verbose: boolean;
  silent: boolean;
  profile: "Debug" | "Release";
};

export async function bench(
  filter = "",
  optionsArg: Partial<BenchOptions> = {},
): Promise<Benchmarks> {
  let config = readConfig();
  let dfxJson = readDfxJson();

  let defaultOptions: BenchOptions = {
    replica: config.toolchain?.["pocket-ic"] ? "pocket-ic" : "dfx",
    replicaVersion: "",
    compiler: "moc",
    compilerVersion: getMocVersion(true),
    gc: "copying",
    forceGc: true,
    save: false,
    compare: false,
    verbose: false,
    silent: false,
    profile: dfxJson?.profile || "Release",
  };

  let options: BenchOptions = { ...defaultOptions, ...optionsArg };

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

  options.replica = replicaType;

  if (process.env.CI) {
    console.log("# Benchmark Results\n\n");
  }

  if (replicaType == "dfx") {
    options.replicaVersion = getDfxVersion();
  } else if (replicaType == "pocket-ic") {
    options.replicaVersion = config.toolchain?.["pocket-ic"] || "";
  }

  options.verbose && console.log(options);

  let replica = new BenchReplica(replicaType, options.verbose);

  let rootDir = getRootDir();
  let globStr = "**/bench?(mark)/**/*.bench.mo";
  if (filter) {
    globStr = `**/bench?(mark)/**/*${filter}*.mo`;
  }
  let files = globSync(path.join(rootDir, globStr), MOTOKO_GLOB_CONFIG);
  if (!files.length) {
    if (filter) {
      options.silent ||
        console.log(`No benchmark files found for filter '${filter}'`);
      return [];
    }
    if (!options.silent) {
      console.log("No *.bench.mo files found");
      console.log(
        "Put your benchmark code in 'bench' directory in *.bench.mo files",
      );
    }
    return [];
  }

  files.sort();

  let benchDir = `${getRootDir()}/.mops/.bench/`;
  fs.rmSync(benchDir, { recursive: true, force: true });
  fs.mkdirSync(benchDir, { recursive: true });

  if (!options.silent && !process.env.CI) {
    console.log("Benchmark files:");
    for (let file of files) {
      console.log(chalk.gray(`• ${absToRel(file)}`));
    }
    if (!process.env.CI) {
      console.log("");
      console.log("=".repeat(50));
      console.log("");
    }
  }

  await replica.start({ silent: options.silent });

  if (!process.env.CI && !options.silent) {
    console.log("Deploying canisters...");
  }

  await parallel(os.cpus().length, files, async (file: string) => {
    try {
      await deployBenchFile(file, options, replica);
    } catch (err) {
      console.error("Unexpected error. Stopping replica...");
      await replica.stop();
      throw err;
    }
  });

  let benchResults: Benchmarks = [];

  await parallel(1, files, async (file: string) => {
    if (!options.silent && !process.env.CI) {
      console.log("\n" + "-".repeat(50));
      console.log(`\nRunning ${chalk.gray(absToRel(file))}...`);
      console.log("");
    }
    try {
      let benchResult = await runBenchFile(file, options, replica);
      benchResults.push(benchResult);
    } catch (err) {
      console.error("Unexpected error. Stopping replica...");
      await replica.stop();
      throw err;
    }
  });

  if (!process.env.CI && !options.silent) {
    console.log("Stopping replica...");
  }
  await replica.stop();

  fs.rmSync(benchDir, { recursive: true, force: true });

  return benchResults;
}

function computeDiff(
  results: Map<string, BenchResult>,
  prevResults: Map<string, BenchResult> | undefined,
  rows: string[],
  cols: string[],
  metric: keyof BenchResult,
): number {
  let diff = 0;
  let count = 0;

  for (let [_rowIndex, row] of rows.entries()) {
    for (let [_colIndex, col] of cols.entries()) {
      let res = results.get(`${row}:${col}`);
      if (res && prevResults) {
        let prevRes = prevResults.get(`${row}:${col}`);
        if (prevRes) {
          let denom = Number(prevRes[metric]);
          let numerator = Number(res[metric]) - denom;
          let percent = 0;
          if (denom !== 0) {
            percent = (numerator / denom) * 100;
          }
          if (!Number.isFinite(percent)) {
            percent = 0;
          }
          diff += percent;
          count++;
        }
      }
    }
  }

  return count > 0 ? diff / count : 0;
}

function computeDiffAll(
  currentResults: Map<string, BenchResult>,
  prevResults: Map<string, BenchResult> | undefined,
  rows: string[],
  cols: string[],
): number {
  let metrics: (keyof BenchResult)[] = [
    "instructions",
    "rts_heap_size",
    "rts_logical_stable_memory_size",
    "rts_reclaimed",
  ];
  let diff = 0;

  for (let metric of metrics) {
    diff += computeDiff(currentResults, prevResults, rows, cols, metric);
  }

  return diff;
}

function getMocArgs(options: BenchOptions): string {
  let args = "";

  if (
    options.compilerVersion &&
    new SemVer(options.compilerVersion).compare("0.15.0") >= 0
  ) {
    args += " --legacy-persistence";
  }

  if (options.forceGc) {
    args += " --force-gc";
  }

  if (options.gc) {
    args += ` --${options.gc}-gc`;
  }

  if (options.profile === "Debug") {
    args += " --debug";
  } else if (options.profile === "Release") {
    args += " --release";
  }

  return args;
}

async function deployBenchFile(
  file: string,
  options: BenchOptions,
  replica: BenchReplica,
): Promise<void> {
  let rootDir = getRootDir();
  let tempDir = path.join(rootDir, ".mops/.bench/", path.parse(file).name);
  let canisterName = path.parse(file).name;

  // prepare temp files
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "dfx.json"),
    JSON.stringify(replica.dfxJson(canisterName), null, 2),
  );

  let benchCanisterData = fs.readFileSync(
    new URL("./bench/bench-canister.mo", import.meta.url),
    "utf8",
  );
  benchCanisterData = benchCanisterData.replace(
    "./user-bench",
    path.relative(tempDir, file).replace(/.mo$/g, ""),
  );
  fs.writeFileSync(path.join(tempDir, "canister.mo"), benchCanisterData);

  // build canister
  let mocPath = getMocPath();
  let mocArgs = getMocArgs(options);
  options.verbose && console.time(`build ${canisterName}`);
  await execaCommand(
    `${mocPath} -c --idl canister.mo ${mocArgs} ${(await sources({ cwd: tempDir })).join(" ")}`,
    {
      cwd: tempDir,
      stdio: options.verbose ? "pipe" : ["pipe", "ignore", "pipe"],
    },
  );
  options.verbose && console.timeEnd(`build ${canisterName}`);

  // deploy canister
  let wasm = path.join(tempDir, "canister.wasm");
  options.verbose && console.time(`deploy ${canisterName}`);
  // await execaCommand(`dfx deploy ${canisterName} --mode reinstall --yes --identity anonymous`, {cwd: tempDir, stdio: options.verbose ? 'pipe' : ['pipe', 'ignore', 'pipe']});
  await replica.deploy(canisterName, wasm, tempDir);
  options.verbose && console.timeEnd(`deploy ${canisterName}`);

  // init bench
  options.verbose && console.time(`init ${canisterName}`);
  let actor = (await replica.getActor(canisterName)) as _SERVICE;
  await actor.init();
  options.verbose && console.timeEnd(`init ${canisterName}`);
}

async function runBenchFile(
  file: string,
  options: BenchOptions,
  replica: BenchReplica,
): Promise<Benchmark> {
  let rootDir = getRootDir();
  let canisterName = path.parse(file).name;

  let actor = (await replica.getActor(canisterName)) as _SERVICE;
  let schema = await actor.getSchema();

  // load previous results
  let prevResults: Map<string, BenchResult> | undefined;
  let resultsJsonFile = path.join(
    rootDir,
    ".bench",
    `${path.parse(file).name}.json`,
  );
  if (options.compare) {
    if (fs.existsSync(resultsJsonFile)) {
      let prevResultsJson = JSON.parse(
        fs.readFileSync(resultsJsonFile).toString(),
      );
      prevResults = new Map(prevResultsJson.results);
    } else {
      console.log(
        chalk.yellow(`No previous results found "${resultsJsonFile}"`),
      );
    }
  }

  let results = new Map<string, BenchResult>();

  let instructionsCells: bigint[][] = Array.from(
    { length: schema.rows.length },
    () => [],
  );
  let heapCells: bigint[][] = Array.from(
    { length: schema.rows.length },
    () => [],
  );
  let logicalStableMemoryCells: bigint[][] = Array.from(
    { length: schema.rows.length },
    () => [],
  );
  let reclaimedCells: bigint[][] = Array.from(
    { length: schema.rows.length },
    () => [],
  );

  let formatNumber = (n: bigint | number): string => {
    return n.toLocaleString("en-US").replaceAll(",", "_");
  };

  let formatSize = (n: bigint | number): string => {
    return filesize(n, { standard: "iec", round: 2 });
  };

  let colorizePercent = (percent: number, wrapInParens = false): string => {
    let sign = percent > 0 ? "+" : "";
    let percentText = percent == 0 ? "0%" : sign + percent.toFixed(2) + "%";
    let color: keyof typeof chalk =
      percent == 0 ? "gray" : percent > 0 ? "red" : "green";
    let parens = wrapInParens ? ["(", ")"] : ["", ""];
    if (process.env.CI) {
      return `$${parens[0]}{\\color{${color}}${percentText.replace("%", "\\\\%")}}${parens[1]}$`;
    } else {
      return `${parens[0]}${chalk[color](percentText)}${parens[1]}`;
    }
  };

  let getTable = (prop: keyof BenchResult): string => {
    let resArr = [["", ...schema.cols]];
    let allZero = true;

    for (let [_rowIndex, row] of schema.rows.entries()) {
      let curRow = [row];

      for (let [_colIndex, col] of schema.cols.entries()) {
        let res = results.get(`${row}:${col}`);
        if (res) {
          if (res[prop] != 0n) {
            allZero = false;
          }

          // compare with previous results
          let diff = "";
          if (options.compare && prevResults) {
            let prevRes = prevResults.get(`${row}:${col}`);
            if (prevRes) {
              let percent =
                ((Number(res[prop]) - Number(prevRes[prop])) /
                  Number(prevRes[prop])) *
                100;
              if (Object.is(percent, NaN)) {
                percent = 0;
              }
              diff = " " + colorizePercent(percent, true);
            } else {
              diff = chalk.yellow(" (no previous results)");
            }
          }

          // add to table
          let value = "";
          if (prop == "rts_logical_stable_memory_size") {
            value = formatSize(res[prop] * 65536n);
          } else if (prop === "rts_heap_size" || prop == "rts_reclaimed") {
            value = formatSize(res[prop]);
          } else {
            value = formatNumber(res[prop]);
          }
          curRow.push(value + diff);
        } else {
          curRow.push("");
        }
      }
      resArr.push(curRow);
    }

    // don't show Stable Memory table if all values are 0
    if (allZero && prop == "rts_logical_stable_memory_size") {
      return "";
    }

    return markdownTable(resArr, {
      align: ["l", ..."r".repeat(schema.cols.length)],
      stringLength: stringWidth,
    });
  };

  let logUpdate = createLogUpdate(process.stdout, { showCursor: true });

  let getOutput = () => {
    if (process.env.CI) {
      return [
        "\n<details>",
        `\n<summary>${absToRel(file)} ${colorizePercent(computeDiffAll(results, prevResults, schema.rows, schema.cols), true).replace("\\\\%", "\\%")}</summary>`,
        `\n${process.env.CI ? `### ${schema.name}` : chalk.bold(schema.name)}`,
        `${schema.description ? "\n" + (process.env.CI ? `_${schema.description}_` : chalk.gray(schema.description)) : ""}`,
        `\n\nInstructions: ${colorizePercent(computeDiff(results, prevResults, schema.rows, schema.cols, "instructions"), false)}`,
        `Heap: ${colorizePercent(computeDiff(results, prevResults, schema.rows, schema.cols, "rts_heap_size"), false)}`,
        `Stable Memory: ${colorizePercent(computeDiff(results, prevResults, schema.rows, schema.cols, "rts_logical_stable_memory_size"), false)}`,
        `Garbage Collection: ${colorizePercent(computeDiff(results, prevResults, schema.rows, schema.cols, "rts_reclaimed"), false)}`,
        `\n\n**Instructions**\n\n${getTable("instructions")}`,
        `\n\n**Heap**\n\n${getTable("rts_heap_size")}`,
        `\n\n**Garbage Collection**\n\n${getTable("rts_reclaimed")}`,
        `${getTable("rts_logical_stable_memory_size") ? `\n\n**Stable Memory**\n\n${getTable("rts_logical_stable_memory_size")}` : ""}`,
        "\n</details>",
      ].join("\n");
    } else {
      return `
				\n${chalk.bold(schema.name)}
				${schema.description ? "\n" + chalk.gray(schema.description) : ""}
				\n\n${chalk.blue("Instructions")}\n\n${getTable("instructions")}
				\n\n${chalk.blue("Heap")}\n\n${getTable("rts_heap_size")}
				\n\n${chalk.blue("Garbage Collection")}\n\n${getTable("rts_reclaimed")}
				${getTable("rts_logical_stable_memory_size") ? `\n\n${chalk.blue("Stable Memory")}\n\n${getTable("rts_logical_stable_memory_size")}` : ""}
			`;
    }
  };

  let canUpdateLog =
    !process.env.CI &&
    !options.silent &&
    terminalSize().rows > getOutput().split("\n").length;

  let log = () => {
    if (options.silent) {
      return;
    }
    let output = getOutput();
    if (process.env.CI || terminalSize().rows <= output.split("\n").length) {
      console.log(output);
    } else {
      logUpdate(output);
    }
  };

  if (canUpdateLog) {
    log();
  }

  // run all cells
  for (let [rowIndex, row] of schema.rows.entries()) {
    for (let [colIndex, col] of schema.cols.entries()) {
      let res = await actor.runCellUpdateAwait(
        BigInt(rowIndex),
        BigInt(colIndex),
      );
      results.set(`${row}:${col}`, res);

      // @ts-ignore
      instructionsCells[rowIndex][colIndex] = res.instructions;
      // @ts-ignore
      heapCells[rowIndex][colIndex] = res.rts_heap_size;
      // @ts-ignore
      logicalStableMemoryCells[rowIndex][colIndex] =
        res.rts_logical_stable_memory_size;
      // @ts-ignore
      reclaimedCells[rowIndex][colIndex] = res.rts_reclaimed;

      if (canUpdateLog) {
        log();
      }
    }
  }

  if (canUpdateLog) {
    logUpdate.done();
  } else {
    log();
  }

  // save results
  if (options.save) {
    console.log(`Saving results to ${chalk.gray(absToRel(resultsJsonFile))}`);
    let json: Record<any, any> = {
      version: 1,
      moc: options.compilerVersion,
      replica: options.replica,
      replicaVersion: options.replicaVersion,
      gc: options.gc,
      forceGc: options.forceGc,
      results: Array.from(results.entries()),
    };
    fs.mkdirSync(path.dirname(resultsJsonFile), { recursive: true });
    fs.writeFileSync(
      resultsJsonFile,
      JSON.stringify(
        json,
        (_, val) => {
          if (typeof val === "bigint") {
            return Number(val);
          } else {
            return val;
          }
        },
        2,
      ),
    );
  }

  // for backend
  return {
    name: schema.name,
    description: schema.description,
    file: absToRel(file),
    gc: options.gc,
    forceGC: options.forceGc,
    replica: options.replica,
    replicaVersion: options.replicaVersion,
    compiler: options.compiler,
    compilerVersion: options.compilerVersion,
    rows: schema.rows,
    cols: schema.cols,
    metrics: [
      ["instructions", instructionsCells],
      ["rts_heap_size", heapCells],
      ["rts_logical_stable_memory_size", logicalStableMemoryCells],
      ["rts_reclaimed", reclaimedCells],
    ],
  };
}
