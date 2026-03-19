import chalk from "chalk";
import os from "node:os";
import { promisify } from "node:util";
import { execFile, execSync } from "node:child_process";

import { ErrorChecker } from "./error-checker.js";
import { Generator } from "./generator.js";
import { parallel } from "../../parallel.js";
import { getRootDir } from "../../mops.js";

export class Deployer {
  verbose = false;
  canisters: Record<string, string> = {};
  status:
    | "pending"
    | "running"
    | "syntax-error"
    | "dfx-error"
    | "error"
    | "success" = "pending";
  errorChecker: ErrorChecker;
  generator: Generator;
  success = 0;
  errors: string[] = [];
  aborted = false;
  controllers = new Map<string, AbortController>();
  currentRun: Promise<any> | undefined;

  constructor({
    verbose,
    canisters,
    errorChecker,
    generator,
  }: {
    verbose: boolean;
    canisters: Record<string, string>;
    errorChecker: ErrorChecker;
    generator: Generator;
  }) {
    this.verbose = verbose;
    this.canisters = canisters;
    this.errorChecker = errorChecker;
    this.generator = generator;
  }

  reset() {
    this.status = "pending";
    this.success = 0;
    this.errors = [];
  }

  async abortCurrent() {
    this.aborted = true;
    for (let controller of this.controllers.values()) {
      controller.abort();
    }
    this.controllers.clear();
    await this.currentRun;
    this.reset();
    this.aborted = false;
  }

  async run(onProgress: () => void) {
    await this.abortCurrent();

    if (this.errorChecker.status === "error") {
      this.status = "syntax-error";
      onProgress();
      return;
    }

    if (Object.keys(this.canisters).length === 0) {
      this.status = "success";
      onProgress();
      return;
    }

    let rootDir = getRootDir();

    try {
      execSync("dfx ping", { cwd: rootDir });
    } catch (error) {
      this.status = "dfx-error";
      onProgress();
      return;
    }

    this.status = "running";
    onProgress();

    // create canisters (sequentially to avoid DFX errors)
    let resolve: (() => void) | undefined;
    this.currentRun = new Promise<void>((res) => (resolve = res));
    for (let canister of Object.keys(this.canisters)) {
      let controller = new AbortController();
      let { signal } = controller;
      this.controllers.set(canister, controller);

      await promisify(execFile)("dfx", ["canister", "create", canister], {
        cwd: rootDir,
        signal,
      }).catch((error) => {
        if (error.code === "ABORT_ERR") {
          return { stderr: "" };
        }
        throw error;
      });

      this.controllers.delete(canister);
    }

    resolve?.();

    if (this.aborted) {
      return;
    }

    this.currentRun = parallel(
      os.cpus().length,
      [...Object.keys(this.canisters)],
      async (canister) => {
        let controller = new AbortController();
        let { signal } = controller;
        this.controllers.set(canister, controller);

        // build
        if (
          this.generator.status !== "success" ||
          !this.generator.canisters[canister]
        ) {
          await promisify(execFile)("dfx", ["build", canister], {
            cwd: rootDir,
            signal,
          }).catch((error) => {
            if (error.code === "ABORT_ERR") {
              return { stderr: "" };
            }
            throw error;
          });
        }

        // install
        await promisify(execFile)(
          "dfx",
          ["canister", "install", "--mode=auto", "--yes", canister],
          { cwd: rootDir, signal },
        ).catch((error) => {
          if (error.code === "ABORT_ERR") {
            return { stderr: "" };
          }
          throw error;
        });

        this.success += 1;
        this.controllers.delete(canister);
        onProgress();
      },
    );

    await this.currentRun;

    if (!this.aborted) {
      this.status = "success";
    }
    onProgress();
  }

  getOutput(): string {
    let get = (v: number) => v.toString();
    let count = (
      this.status === "running"
        ? get
        : chalk.bold[this.errors.length > 0 ? "redBright" : "green"]
    )(this.errors.length || this.success);

    if (this.status === "pending") {
      return `Deploy: ${chalk.gray("(pending)")}`;
    }
    if (this.status === "running") {
      return `Deploy: ${count}/${Object.keys(this.canisters).length} ${chalk.gray("(running)")}`;
    }
    if (this.status === "syntax-error") {
      return `Deploy: ${chalk.gray("(errors)")}`;
    }
    if (this.status === "dfx-error") {
      return `Deploy: ${chalk.gray("(dfx not running)")}`;
    }

    return `Deploy: ${count}`;
  }
}
