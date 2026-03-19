import chalk from "chalk";
import { absToRel } from "../utils.js";
import { MMF1 } from "../mmf1.js";
import { Reporter } from "./reporter.js";
import { TestMode } from "../../../types.js";

export class SilentReporter implements Reporter {
  total = 0;
  passed = 0;
  failed = 0;
  skipped = 0;
  passedFiles = 0;
  failedFiles = 0;
  passedNamesFlat: string[] = [];
  flushOnError = true;
  errorOutput = "";
  onProgress = () => {};

  constructor(flushOnError = true, onProgress = () => {}) {
    this.flushOnError = flushOnError;
    this.onProgress = onProgress;
  }

  addFiles(files: string[]) {
    this.total = files.length;
  }

  addRun(file: string, mmf: MMF1, state: Promise<void>, _mode: TestMode) {
    state.then(() => {
      this.passed += mmf.passed;
      this.failed += mmf.failed;
      this.skipped += mmf.skipped;
      this.passedNamesFlat = [...this.passedNamesFlat, ...mmf.passedNamesFlat];

      if (mmf.passed === 0 && mmf.failed === 0) {
        this.passed++;
        this.passedNamesFlat.push(absToRel(file));
      }

      this.passedFiles += Number(mmf.failed === 0);
      this.failedFiles += Number(mmf.failed !== 0);

      if (mmf.failed) {
        let output = `${chalk.red("✖")} ${absToRel(file)}\n${mmf.getErrorMessages().join("\n")}\n${"-".repeat(50)}`;

        if (this.flushOnError) {
          console.log(output);
        } else {
          this.errorOutput = `${this.errorOutput}\n${output}`.trim();
        }
      }

      this.onProgress();
    });
  }

  done(): boolean {
    return this.failed === 0;
  }
}
