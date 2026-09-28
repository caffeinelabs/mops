import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import chalk from "chalk";

import { getRootDir, readConfig } from "../mops.js";
import { cliError } from "../error.js";
import { withFixLock } from "../helpers/fix-lock.js";
import { resolveCanisterConfigs } from "../helpers/resolve-canisters.js";
import { check } from "./check.js";
import { installAll } from "./install/install-all.js";
import { findFormatFiles, format, type FormatResult } from "./format.js";

// `mops check` is the judge of a formatter bug: formatting it rejects is put
// back. It is not run first, so `--verify` assumes the project already passes.
export async function formatVerified(filter: string): Promise<FormatResult> {
  // Formats, checks and restores as one unit, so a concurrent `--fix` run
  // cannot edit a file between the snapshot and the revert.
  return withFixLock(async () => {
    let rootDir = getRootDir();
    let files = findFormatFiles(rootDir, filter);
    let originals = new Map(
      await Promise.all(
        files.map(
          async (file) => [file, await fs.readFile(file, "utf8")] as const,
        ),
      ),
    );

    let result = await format(filter);

    // Compared on disk, not parsed from the formatter's report, so this works
    // the same for mo-fmt and the Prettier plugin.
    let formatted = new Map<string, string>();
    for (let [file, original] of originals) {
      let current = await fs.readFile(file, "utf8").catch(() => undefined);
      if (current !== undefined && current !== original) {
        formatted.set(file, current);
      }
    }
    if (formatted.size === 0) {
      return result;
    }

    let n = formatted.size;
    let plural = n === 1 ? "" : "s";
    console.log("");
    console.log(
      chalk.gray(`Verifying ${n} formatted file${plural} with mops check...`),
    );
    try {
      await runCheck(rootDir, [...formatted.keys()]);
    } catch (err) {
      let notReverted = await revert(originals, formatted);
      let reason =
        err instanceof Error && err.message ? `${err.message}\n\n` : "";
      let kept =
        notReverted.length > 0
          ? `\nNot reverted, edited while mops check ran:\n${notReverted.map((f) => `  ${f}`).join("\n")}`
          : "";
      cliError(
        `${reason}mops check failed after formatting, so the formatting of ` +
          `${n - notReverted.length} file${plural} was reverted.\n` +
          `--verify assumes mops check passed before formatting; if it was already failing, fix that first.${kept}`,
      );
    }
    console.log(
      chalk.green(
        `✓ mops check passed, kept the formatting of ${n} file${plural}`,
      ),
    );
    return result;
  });
}

// The same check `mops check` runs with no arguments. A package without
// canisters is checked file by file instead, as `mops check <files>` would.
async function runCheck(rootDir: string, files: string[]) {
  if (!(await installAll({ silent: true, lock: "maintain" }))) {
    cliError();
  }
  let hasCanisters =
    Object.keys(resolveCanisterConfigs(readConfig())).length > 0;
  await check(
    hasCanisters ? [] : files.map((file) => path.relative(process.cwd(), file)),
  );
}

// Restores only files still holding what the formatter wrote; anything else
// was edited during the check and is left alone. Returns those, relative.
async function revert(
  originals: Map<string, string>,
  formatted: Map<string, string>,
): Promise<string[]> {
  let notReverted: string[] = [];
  for (let [file, content] of formatted) {
    let current = await fs.readFile(file, "utf8").catch(() => undefined);
    if (current === content) {
      await fs.writeFile(file, originals.get(file)!);
    } else {
      notReverted.push(path.relative(getRootDir(), file));
    }
  }
  return notReverted;
}
