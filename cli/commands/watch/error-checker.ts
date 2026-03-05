import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import chalk from "chalk";

import { getMocPath } from "../../helpers/get-moc-path.js";
import { getGlobalMocArgs, getRootDir, readConfig } from "../../mops.js";
import { sources } from "../sources.js";
import { parallel } from "../../parallel.js";
import { globMoFiles } from "./globMoFiles.js";

export class ErrorChecker {
  verbose = false;
  canisters: Record<string, string> = {};
  status: "pending" | "running" | "error" | "success" = "pending";
  errors: string[] = [];
  totalFiles = 0;
  processedFiles = 0;

  constructor({
    verbose,
    canisters,
  }: {
    verbose: boolean;
    canisters: Record<string, string>;
  }) {
    this.verbose = verbose;
    this.canisters = canisters;
  }

  reset() {
    this.status = "pending";
    this.errors = [];
    this.totalFiles = 0;
    this.processedFiles = 0;
  }

  async run(onProgress: () => void) {
    this.reset();

    this.status = "running";
    onProgress();

    let rootDir = getRootDir();
    let mocPath = getMocPath();
    let deps = await sources({ cwd: rootDir });
    let globalMocArgs = getGlobalMocArgs(readConfig());

    let paths = globMoFiles(rootDir);

    this.totalFiles = paths.length;
    this.processedFiles = 0;

    await parallel(os.cpus().length, paths, async (file) => {
      try {
        await promisify(execFile)(
          mocPath,
          [
            "--check",
            ...deps.flatMap((x) => x.split(" ")),
            ...globalMocArgs,
            file,
          ],
          { cwd: rootDir },
        );
      } catch (error: any) {
        error.message.split("\n").forEach((line: string) => {
          if (line.match(/: \w+ error \[/)) {
            // better formatting
            let str = line
              .replace(/: (\w+ error) \[/, (_, m1) => `: ${chalk.red(m1)} [`)
              .replace(/unbound type (\w+)/, `unbound type ${chalk.bold("$1")}`)
              .replace(
                /unbound variable (\w+)/,
                `unbound variable ${chalk.bold("$1")}`,
              )
              .trim();
            this.errors.push(str);
          } else if (line.startsWith("  ") && this.errors.length) {
            this.errors[this.errors.length - 1] += "\n  " + line;
          } else {
            // console.log('UNKNOWN ERROR', line);
          }
        });
      }
      this.processedFiles++;
      onProgress();
    });

    this.status = this.errors.length ? "error" : "success";
    onProgress();
  }

  getOutput(): string {
    if (this.status === "pending") {
      return `Errors: ${chalk.gray("(pending)")}`;
    }
    if (this.status === "running") {
      return `Errors: ${this.processedFiles}/${this.totalFiles} ${chalk.gray("(running)")}`;
    }
    let output = "";
    let uniqueErrors = [...new Set(this.errors)];
    output += `Errors: ${chalk.bold[uniqueErrors.length ? "redBright" : "green"](uniqueErrors.length)}`;
    if (this.verbose && this.errors.length) {
      output += `\n  ${uniqueErrors.join("\n  ")}`;
    }
    return output;
  }
}
