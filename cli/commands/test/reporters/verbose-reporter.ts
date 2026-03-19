import chalk from "chalk";
import { absToRel } from "../utils.js";
import { MMF1 } from "../mmf1.js";
import { Reporter } from "./reporter.js";
import { TestMode } from "../../../types.js";

export class VerboseReporter implements Reporter {
  passed = 0;
  failed = 0;
  skipped = 0;

  #startTime = Date.now();
  #curFileIndex = 0;

  addFiles(files: string[]) {
    console.log("Test files:");
    for (let file of files) {
      console.log(chalk.gray(`• ${absToRel(file)}`));
    }
    console.log("=".repeat(50));
  }

  addRun(
    file: string,
    mmf: MMF1,
    state: Promise<void>,
    mode: TestMode,
    progressive = false,
  ) {
    if (progressive) {
      this._printStart(file, mode);
    }

    state.then(() => {
      this.passed += mmf.passed;
      this.failed += mmf.failed;
      this.skipped += mmf.skipped;

      if (mmf.passed === 0 && mmf.failed === 0) {
        this.passed++;
      }
      if (!progressive) {
        this._printStart(file, mode);
      }
      mmf.flush();
    });
  }

  done(): boolean {
    console.log("=".repeat(50));
    if (this.failed) {
      console.log(chalk.redBright("Tests failed"));
    } else {
      console.log(chalk.greenBright("Tests passed"));
    }

    console.log(
      `Done in ${chalk.gray(((Date.now() - this.#startTime) / 1000).toFixed(2) + "s")}` +
        `, passed ${chalk.greenBright(this.passed)}` +
        (this.skipped
          ? `, skipped ${chalk[this.skipped ? "yellowBright" : "gray"](this.skipped)}`
          : "") +
        (this.failed
          ? `, failed ${chalk[this.failed ? "redBright" : "gray"](this.failed)}`
          : ""),
    );

    return this.failed === 0;
  }

  _printStart(file: string, mode: TestMode) {
    this.#curFileIndex++ && console.log("-".repeat(50));
    console.log(
      `Running ${chalk.gray(absToRel(file))} ${mode === "interpreter" ? "" : chalk.gray(`(${mode})`)}`,
    );
  }
}
