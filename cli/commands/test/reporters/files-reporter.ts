import chalk from "chalk";
import { absToRel } from "../utils.js";
import { MMF1 } from "../mmf1.js";
import { Reporter } from "./reporter.js";
import { TestMode } from "../../../types.js";

export class FilesReporter implements Reporter {
  passed = 0;
  failed = 0;
  skipped = 0;

  #startTime = Date.now();

  addFiles(files: string[]) {
    console.log(`Test files: ${files.length}`);
    console.log("=".repeat(50));
  }

  addRun(file: string, mmf: MMF1, state: Promise<void>, mode: TestMode) {
    state.then(() => {
      this.passed += Number(mmf.failed === 0);
      this.failed += Number(mmf.failed !== 0);
      this.skipped += mmf.skipped;

      if (mmf.failed) {
        console.log(chalk.red("✖"), absToRel(file));
        mmf.flush("fail");
        console.log("-".repeat(50));
      } else {
        console.log(
          `${chalk.green("✓")} ${absToRel(file)} ${mode === "interpreter" ? "" : chalk.gray(`(${mode})`)}`,
        );
      }
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
        `, passed ${chalk.greenBright(this.passed)} files` +
        (this.skipped
          ? `, skipped ${chalk[this.skipped ? "yellowBright" : "gray"](this.skipped)} cases`
          : "") +
        (this.failed
          ? `, failed ${chalk[this.failed ? "redBright" : "gray"](this.failed)} files`
          : ""),
    );

    return this.failed === 0;
  }
}
