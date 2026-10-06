import fs from "node:fs/promises";
import path from "node:path";
import { globSync } from "glob";
import chalk from "chalk";
import { execa } from "execa";
import * as prettier from "prettier";
import motokoPlugin from "prettier-plugin-motoko";

import { getRootDir, readConfig } from "../mops.js";
import { absToRel } from "./test/utils.js";
import { parallel } from "../parallel.js";
import { isNestedCheckout, MOTOKO_GLOB_CONFIG } from "../constants.js";
import { cliError } from "../error.js";
import { dropGitIgnored } from "../helpers/gitignore.js";
import { toolchain } from "./toolchain/index.js";

type FormatOptions = {
  check: boolean;
  silent: boolean;
  /** Flags after `--`, forwarded to mo-fmt. */
  extraArgs: string[];
};

export type FormatResult = {
  ok: boolean;
  total: number;
  checked: number;
  valid: number;
  invalid: number;
  formatted: number;
};

/** Absolute paths of the `.mo` files `mops format [filter]` formats. */
export function findFormatFiles(rootDir: string, filter: string): string[] {
  let globStr = filter ? `**/*${filter}*.mo` : "**/*.mo";
  let files = globSync(path.join(rootDir, globStr), {
    ...MOTOKO_GLOB_CONFIG,
    cwd: rootDir,
  }).filter((file) => !isNestedCheckout(file, rootDir));
  // mo-fmt honours `.gitignore` only when walking a directory, never for a file it is passed.
  return dropGitIgnored(files, rootDir);
}

export async function format(
  filter: string,
  options: Partial<FormatOptions> = {},
  signal?: AbortSignal,
  onProgress?: (result: FormatResult) => void,
): Promise<FormatResult> {
  let startTime = Date.now();

  let moFmtPinned = Boolean(readConfig().toolchain?.["mo-fmt"]);
  // The Prettier plugin takes no flags, so there is nothing to forward them to.
  if (options.extraArgs?.length && !moFmtPinned) {
    cliError(
      "Arguments after -- are forwarded to mo-fmt, which is not pinned in [toolchain].\n" +
        `Run ${chalk.green("mops toolchain use mo-fmt 0.2.0")} to pin it.`,
    );
  }

  let rootDir = getRootDir();
  let files = findFormatFiles(rootDir, filter);
  let invalidFiles = 0;
  let checkedFiles = 0;

  let getResult = (ok: boolean) => {
    let result: FormatResult = {
      ok,
      total: files.length,
      checked: checkedFiles,
      valid: files.length - invalidFiles,
      invalid: invalidFiles,
      formatted: invalidFiles,
    };
    onProgress?.(result);
    return result;
  };

  if (!files.length) {
    if (filter) {
      options.silent || console.log(`No files found for filter '${filter}'`);
      return getResult(false);
    }
    if (!options.silent) {
      console.log("No *.mo files found");
    }
    return getResult(false);
  }

  if (signal?.aborted) {
    return getResult(false);
  }

  // A pinned mo-fmt replaces the bundled formatter outright, no fallback.
  if (moFmtPinned) {
    let { exitCode, formatted } = await runMoFmt(
      files.map((file) => path.relative(rootDir, file)),
      rootDir,
      options,
      signal,
      (checked, formatted) => {
        checkedFiles = checked;
        invalidFiles = formatted;
        getResult(false);
      },
    );
    invalidFiles = formatted;
    if (signal?.aborted) {
      return getResult(false);
    }
    if (exitCode === 1 && !options.silent) {
      // The forwarded flags are part of what `--check` checked against.
      let extra = options.extraArgs?.length
        ? ` -- ${options.extraArgs.join(" ")}`
        : "";
      console.log(
        `Run '${chalk.yellow("mops format" + (filter ? ` ${filter}` : "") + extra)}' to format your code`,
      );
    }
    return getResult(exitCode === 0);
  }

  // get prettier config from .prettierrc
  let prettierConfigFile = await prettier.resolveConfigFile();

  await parallel(4, files, async (file) => {
    if (signal?.aborted) {
      return;
    }

    let conf = await prettier.resolveConfig(file, { editorconfig: true });
    let prettierConfig: prettier.Options = {};
    if (prettierConfigFile) {
      if (conf) {
        prettierConfig = conf;
      }
    }

    // merge config from mops.toml [format]
    // disabled, because we lose vscode extension support
    // if (config.format) {
    // 	Object.assign(prettierConfig, config.format);
    // }

    // add motoko parser plugin
    Object.assign(prettierConfig, {
      parser: "motoko-tt-parse",
      plugins: [motokoPlugin],
      filepath: file,
    });

    // check file
    let code = await fs.readFile(file, "utf8");
    let formatted = await prettier.format(code, prettierConfig);
    let ok = formatted === code;
    invalidFiles += Number(!ok);

    if (options.check) {
      if (ok) {
        options.silent ||
          console.log(
            `${chalk.green("✓")} ${absToRel(file)} ${chalk.gray("valid")}`,
          );
      } else {
        options.silent ||
          console.log(
            `${chalk.red("✖")} ${absToRel(file)} ${chalk.gray("invalid")}`,
          );
      }
    } else {
      if (ok) {
        options.silent ||
          console.log(
            `${chalk.green("✓")} ${absToRel(file)} ${chalk.gray("valid")}`,
          );
      } else {
        await fs.writeFile(file, formatted);
        options.silent ||
          console.log(
            `${chalk.yellow("*")} ${absToRel(file)} ${chalk.gray("formatted")}`,
          );
      }
    }

    checkedFiles += 1;

    // trigger onProgress
    getResult(false);
  });

  if (signal?.aborted) {
    return getResult(false);
  }

  if (!options.silent) {
    console.log("-".repeat(50));

    let plural = (n: number) => (n === 1 ? "" : "s");
    let str = `Checked ${chalk.gray(files.length)} file${plural(files.length)} in ${chalk.gray(((Date.now() - startTime) / 1000).toFixed(2) + "s")}`;
    if (invalidFiles) {
      str += options.check
        ? `, invalid ${chalk.redBright(invalidFiles)} file${plural(invalidFiles)}`
        : `, formatted ${chalk.yellowBright(invalidFiles)} file${plural(invalidFiles)}`;
    }
    console.log(str);

    if (!invalidFiles) {
      console.log(chalk.green("✓ All files have valid formatting"));
    }
  }

  if (options.check && invalidFiles && !options.silent) {
    console.log(
      `${`Run '${chalk.yellow("mops format" + (filter ? ` ${filter}` : ""))}' to format your code`}`,
    );
    return getResult(false);
  }

  return getResult(true);
}

// Keeps each mo-fmt invocation well under the OS argument limit (1 MiB on
// macOS, environment included). Only huge projects split, and then each
// chunk prints its own summary line.
const MO_FMT_ARGS_BUDGET = 100_000;

let chunkByLength = (files: string[]): string[][] => {
  let chunks: string[][] = [];
  let chunk: string[] = [];
  let length = 0;
  for (let file of files) {
    if (chunk.length > 0 && length + file.length + 1 > MO_FMT_ARGS_BUDGET) {
      chunks.push(chunk);
      chunk = [];
      length = 0;
    }
    chunk.push(file);
    length += file.length + 1;
  }
  if (chunk.length > 0) {
    chunks.push(chunk);
  }
  return chunks;
};

// mo-fmt reads `mo-fmt.toml` from its working directory, so it runs from the
// project root. Its own output is the report: one stdout line per changed file
// (as passed), a summary line, and one stderr message per failed file.
async function runMoFmt(
  files: string[],
  rootDir: string,
  options: Partial<FormatOptions>,
  signal: AbortSignal | undefined,
  onChunk: (checked: number, formatted: number) => void,
): Promise<{ exitCode: number; formatted: number }> {
  let bin = await toolchain.bin("mo-fmt");
  let passed = new Set(files);
  let exitCode = 0;
  let checked = 0;
  let formatted = 0;

  for (let chunk of chunkByLength(files)) {
    // `--` ends mo-fmt's options, so a path starting with `-` stays a path.
    let args = [
      ...(options.check ? ["--check"] : []),
      ...(options.extraArgs ?? []),
      "--",
      ...chunk,
    ];
    let result = await execa(bin, args, {
      cwd: rootDir,
      stdin: "ignore",
      stdout: options.silent ? "pipe" : ["pipe", "inherit"],
      stderr: options.silent ? "pipe" : "inherit",
      reject: false,
      cancelSignal: signal,
    });
    if (signal?.aborted) {
      return { exitCode: 1, formatted };
    }
    if (result.exitCode === undefined) {
      cliError(`Error while running mo-fmt\n${result.message}`);
    }
    // 0 formatted, 1 needs formatting (--check), 2 a file failed: worst wins.
    exitCode = Math.max(exitCode, result.exitCode);
    checked += chunk.length;
    formatted += result.stdout
      .split("\n")
      .filter((line) => passed.has(line)).length;
    onChunk(checked, formatted);
  }

  return { exitCode, formatted };
}
