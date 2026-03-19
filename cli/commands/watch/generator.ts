import os from "node:os";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import chalk from "chalk";

import { ErrorChecker } from "./error-checker.js";
import { parallel } from "../../parallel.js";
import { getRootDir } from "../../mops.js";

export class Generator {
  verbose = false;
  canisters: Record<string, string> = {};
  status: "pending" | "running" | "syntax-error" | "error" | "success" =
    "pending";
  errorChecker: ErrorChecker;
  success = 0;
  errors: string[] = [];
  aborted = false;
  controllers = new Map<string, AbortController>();
  currentRun: Promise<any> | undefined;

  constructor({
    verbose,
    canisters,
    errorChecker,
  }: {
    verbose: boolean;
    canisters: Record<string, string>;
    errorChecker: ErrorChecker;
  }) {
    this.verbose = verbose;
    this.canisters = canisters;
    this.errorChecker = errorChecker;
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

    this.status = "running";
    onProgress();

    let rootDir = getRootDir();

    this.currentRun = parallel(
      os.cpus().length,
      [...Object.keys(this.canisters)],
      async (canister) => {
        let controller = new AbortController();
        let { signal } = controller;
        this.controllers.set(canister, controller);

        await promisify(execFile)("dfx", ["generate", canister], {
          cwd: rootDir,
          signal,
        }).catch((error) => {
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
      return `Generate: ${chalk.gray("(pending)")}`;
    }
    if (this.status === "running") {
      return `Generate: ${count}/${Object.keys(this.canisters).length} ${chalk.gray("(running)")}`;
    }
    if (this.status === "syntax-error") {
      return `Generate: ${chalk.gray("(errors)")}`;
    }

    return `Generate: ${count}`;
  }
}
