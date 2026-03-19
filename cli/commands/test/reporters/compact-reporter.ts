import chalk from "chalk";
import logUpdate from "log-update";
import { absToRel } from "../utils.js";
import { MMF1 } from "../mmf1.js";
import { Reporter } from "./reporter.js";
import { TestMode } from "../../../types.js";

export class CompactReporter implements Reporter {
  passed = 0;
  failed = 0;
  skipped = 0;
  passedFiles = 0;
  failedFiles = 0;

  #allFiles = new Set<string>();
  #runningFiles = new Set<string>();
  #failedFiles = new Set<string>();
  #finishedFiles = new Set<string>();
  #startTime = Date.now();

  addFiles(files: string[]) {
    this.#allFiles = new Set(files);
    this.#log();
    this.#startTimer();
  }

  addRun(file: string, mmf: MMF1, state: Promise<void>, _mode: TestMode) {
    this.#runningFiles.add(file);
    this.#log();

    state.then(() => {
      this.passed += mmf.passed;
      this.failed += mmf.failed;
      this.skipped += mmf.skipped;

      if (mmf.passed === 0 && mmf.failed === 0) {
        this.passed++;
      }

      this.passedFiles += Number(mmf.failed === 0);
      this.failedFiles += Number(mmf.failed !== 0);

      if (mmf.failed) {
        this.#failedFiles.add(file);
        logUpdate.clear();
        console.log(chalk.red("✖"), absToRel(file));
        mmf.flush("fail");
        console.log("-".repeat(50));
      }

      this.#runningFiles.delete(file);
      this.#finishedFiles.add(file);
      this.#log();
    });
  }

  done(): boolean {
    this.#log();
    logUpdate.done();
    this.#clearTimer();
    return this.failed === 0;
  }

  #timerId: NodeJS.Timeout | null = null;
  #startTimer() {
    this.#timerId = setInterval(() => this.#log(), 55);
  }

  #clearTimer() {
    if (this.#timerId) {
      clearInterval(this.#timerId);
    }
  }

  #log() {
    let res: string[] = [];
    let i = 0;
    for (let file of this.#allFiles) {
      if (this.#runningFiles.has(file)) {
        res[Number(i)] = ".";
      } else if (this.#finishedFiles.has(file)) {
        res[Number(i)] = this.#failedFiles.has(file) ? chalk.red(":") : ":";
      } else {
        res[Number(i)] = " ";
      }
      i++;
    }

    let output =
      `[${res.join("")}]\n` +
      `${chalk.gray(((Date.now() - this.#startTime) / 1000).toFixed(2) + "s")}` +
      `, total ${this.#allFiles.size} files` +
      `, passed ${chalk.greenBright(this.passedFiles)} files` +
      (this.skipped
        ? `, skipped ${chalk[this.skipped ? "yellowBright" : "gray"](this.skipped)} cases`
        : "") +
      (this.failed
        ? `, failed ${chalk[this.failed ? "redBright" : "gray"](this.failed)} cases`
        : "");

    logUpdate(output);
  }
}
