import path from "node:path";
import fs from "node:fs";
import { ChildProcessWithoutNullStreams } from "node:child_process";
import { Readable } from "node:stream";
import chalk from "chalk";
import { getRootDir } from "../../mops.js";
import { MMF1 } from "./mmf1.js";

export function absToRel(p: string) {
  let rootDir = getRootDir();
  return path.relative(rootDir, path.resolve(p));
}

export function pipeStdoutToMMF(stdout: Readable, mmf: MMF1) {
  stdout.on("data", (data) => {
    for (let line of data.toString().split("\n")) {
      line = line.trim();
      if (line) {
        mmf.parseLine(line);
      }
    }
  });
}

export function pipeStderrToMMF(stderr: Readable, mmf: MMF1, dir = "") {
  stderr.on("data", (data) => {
    let text: string = data.toString().trim();
    let failedLine = "";

    text = text.replace(
      /([\w+._/-]+):(\d+).(\d+)(-\d+.\d+)/g,
      (_m0, m1: string, m2: string, m3: string) => {
        // change absolute file path to relative
        // change :line:col-line:col to :line:col to work in vscode
        let res = `${absToRel(m1)}:${m2}:${m3}`;
        let file = path.join(dir, m1);

        if (!fs.existsSync(file)) {
          return res;
        }

        // show failed line
        let content = fs.readFileSync(file);
        let lines = content.toString().split("\n") || [];

        failedLine += chalk.dim("\n   ...");

        let lineBefore = lines[+m2 - 2];
        if (lineBefore) {
          failedLine += chalk.dim(
            `\n   ${+m2 - 1}\t| ${lineBefore.replaceAll("\t", "  ")}`,
          );
        }
        failedLine += `\n${chalk.redBright`->`} ${m2}\t| ${lines[+m2 - 1]?.replaceAll("\t", "  ")}`;
        if (lines.length > +m2) {
          failedLine += chalk.dim(
            `\n   ${+m2 + 1}\t| ${lines[+m2]?.replaceAll("\t", "  ")}`,
          );
        }
        failedLine += chalk.dim("\n   ...");
        return res;
      },
    );
    if (failedLine) {
      text += failedLine;
    }
    mmf.fail(text);
  });
}

export function pipeMMF(proc: ChildProcessWithoutNullStreams, mmf: MMF1) {
  return new Promise<void>((resolve) => {
    pipeStdoutToMMF(proc.stdout, mmf);
    pipeStderrToMMF(proc.stderr, mmf);

    // exit
    proc.on("close", (code) => {
      if (code === 0) {
        mmf.strategy !== "print" && mmf.pass();
      } else if (code !== 1) {
        mmf.fail(`unknown exit code: ${code}`);
      }
      resolve();
    });
  });
}
