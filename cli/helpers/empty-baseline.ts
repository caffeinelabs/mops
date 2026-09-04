import chalk from "chalk";
import { execa } from "execa";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

// The stable signature of a fresh canister.
export const EMPTY_ACTOR_MOST = "// Version: 1.0.0\nactor { };\n";

// Per-invocation scratch dir lives under `.mops/`; `mkdtemp` makes it unique so
// concurrent `mops` processes don't clobber each other's `empty.most`.
const SCRATCH_PARENT = ".mops";
const SCRATCH_PREFIX = ".empty-baseline-";

export interface EmptyBaselineResult {
  compatible: boolean;
  /** moc stderr+stdout on failure, for callers that surface a reason. */
  compilerOutput: string;
}

/**
 * `moc --stable-compatible` from an empty actor's stable signature to
 * `mostPath` — whether the wasm can land on a fresh canister, or only as an
 * upgrade over pre-existing state. Never throws on incompatibility.
 */
export async function checkEmptyBaselineCompatibility(
  mocPath: string,
  mostPath: string,
  options: { verbose?: boolean } = {},
): Promise<EmptyBaselineResult> {
  await mkdir(SCRATCH_PARENT, { recursive: true });
  const scratchDir = await mkdtemp(join(SCRATCH_PARENT, SCRATCH_PREFIX));
  const emptyMostPath = join(scratchDir, "empty.most");

  try {
    await writeFile(emptyMostPath, EMPTY_ACTOR_MOST);
    const args = ["--stable-compatible", emptyMostPath, mostPath];
    if (options.verbose) {
      console.log(chalk.gray(mocPath, JSON.stringify(args)));
    }
    const result = await execa(mocPath, args, {
      stdio: "pipe",
      reject: false,
    });
    const compilerOutput = [result.stderr, result.stdout]
      .filter((output) => output?.trim())
      .join("\n")
      .trim();
    return { compatible: result.exitCode === 0, compilerOutput };
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}
