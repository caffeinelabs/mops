import chalk from "chalk";
import { format, FormatResult } from "../format.js";
import { ErrorChecker } from "./error-checker.js";

export class Formatter {
  verbose = false;
  status: "pending" | "running" | "syntax-error" | "error" | "success" =
    "pending";
  errorChecker: ErrorChecker;
  aborted = false;
  controller = new AbortController();
  currentRun: Promise<any> | undefined;
  result: FormatResult | undefined;

  constructor({
    verbose,
    errorChecker,
  }: {
    verbose: boolean;
    errorChecker: ErrorChecker;
  }) {
    this.verbose = verbose;
    this.errorChecker = errorChecker;
  }

  reset() {
    this.status = "pending";
    this.result = undefined;
  }

  async abortCurrent() {
    this.aborted = true;
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

    this.controller = new AbortController();

    this.currentRun = format(
      "",
      { silent: true },
      this.controller.signal,
      (result) => {
        this.result = result;
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
    if (this.status === "pending") {
      return `Format: ${chalk.gray("(pending)")}`;
    }
    if (this.status === "syntax-error") {
      return `Format: ${chalk.gray("(errors)")}`;
    }

    if (!this.result) {
      return `Format: ${chalk.gray("(pending)")}`;
    }

    if (this.status === "running") {
      return `Format: ${this.result.checked}/${this.result.total} ${chalk.gray("(running)")}`;
    }
    return `Format: ${chalk.greenBright(`${this.result.formatted}`)}`;
  }
}
