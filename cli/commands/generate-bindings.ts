import chalk from "chalk";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cliError } from "../error.js";
import { bindMotoko } from "../helpers/bind-motoko.js";
import { getRootDir, readConfig, resolveConfigPath } from "../mops.js";
import { BindingConfig } from "../types.js";

export interface GenerateBindingsOptions {
  output?: string;
  verbose?: boolean;
}

export async function generateBindings(
  targets: string[] | undefined,
  options: GenerateBindingsOptions,
): Promise<void> {
  if (targets?.length === 0) {
    cliError("No bindings specified");
  }

  // Ad-hoc: `mops generate bindings path.did -o out.mo`
  if (targets?.length === 1 && looksLikeDidPath(targets[0]!)) {
    await generateAdHoc(targets[0]!, options);
    return;
  }
  if (targets?.some(looksLikeDidPath)) {
    if (options.output) {
      cliError(
        "Ad-hoc generation accepts only one .did path at a time:\n" +
          "  mops generate bindings candid/foo.did -o bindings/Foo.mo",
      );
    }
    cliError(
      "Ad-hoc generation takes a single .did path and requires --output / -o:\n" +
        "  mops generate bindings candid/foo.did -o bindings/Foo.mo",
    );
  }

  const config = readConfig();
  const bindings = config.bindings ?? {};
  const names = Object.keys(bindings);

  if (!names.length) {
    cliError(
      "No [bindings.*] entries in mops.toml.\n" +
        "Add one, e.g.:\n" +
        "  [bindings.ICRC]\n" +
        '  did = "candid/icrc.did"\n' +
        "Or generate ad-hoc:\n" +
        "  mops generate bindings candid/icrc.did -o bindings/ICRC.mo",
    );
  }

  const selected = targets?.length
    ? targets.map((name) => {
        if (!bindings[name]) {
          cliError(
            `Binding ${JSON.stringify(name)} not found in mops.toml [bindings.*]`,
          );
        }
        return name;
      })
    : names;

  if (options.output && selected.length > 1) {
    cliError(
      "--output / -o is only supported when generating a single binding",
    );
  }

  const rootDir = getRootDir();

  for (const name of selected) {
    const entry = bindings[name]!;
    validateBindingEntry(name, entry);
    const didFs = resolveConfigPath(entry.did);
    const dest = resolveBindingDestination(
      name,
      entry,
      options.output,
      rootDir,
    );

    console.log(
      chalk.blue("generate bindings"),
      chalk.bold(name),
      chalk.gray(`← ${entry.did}`),
      chalk.gray(`→ ${dest.display}`),
    );

    const didText = await readDidFile(didFs);
    let mo: string;
    try {
      mo = bindMotoko(didText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      cliError(`Failed to generate Motoko bindings for ${name}: ${msg}`);
    }

    await mkdir(path.dirname(dest.fsPath), { recursive: true });
    await writeFile(dest.fsPath, mo, "utf8");

    if (options.verbose) {
      console.log(chalk.gray(`wrote ${dest.fsPath} (${mo.length} bytes)`));
    }
  }

  console.log(
    chalk.green(
      `\n✓ Generated Motoko bindings for ${selected.length} interface${selected.length === 1 ? "" : "s"}`,
    ),
  );
}

async function generateAdHoc(
  didPath: string,
  options: GenerateBindingsOptions,
): Promise<void> {
  if (!options.output) {
    cliError(
      "Ad-hoc generation requires --output / -o:\n" +
        `  mops generate bindings ${didPath} -o <out.mo>`,
    );
  }

  const rootDir = getRootDir();
  const didFs = path.isAbsolute(didPath)
    ? didPath
    : path.resolve(process.cwd(), didPath);
  const dest = resolveOutputPath(options.output, rootDir);

  console.log(
    chalk.blue("generate bindings"),
    chalk.gray(`← ${didPath}`),
    chalk.gray(`→ ${dest.display}`),
  );

  const didText = await readDidFile(didFs);
  let mo: string;
  try {
    mo = bindMotoko(didText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    cliError(`Failed to generate Motoko bindings: ${msg}`);
  }

  await mkdir(path.dirname(dest.fsPath), { recursive: true });
  await writeFile(dest.fsPath, mo, "utf8");

  if (options.verbose) {
    console.log(chalk.gray(`wrote ${dest.fsPath} (${mo.length} bytes)`));
  }

  console.log(chalk.green(`\n✓ Generated Motoko bindings`));
}

function looksLikeDidPath(arg: string): boolean {
  return arg.endsWith(".did");
}

function validateBindingEntry(name: string, entry: BindingConfig): void {
  if (!entry || typeof entry !== "object") {
    cliError(
      `[bindings.${name}] must be a table with a did field, e.g. did = "candid/foo.did"`,
    );
  }
  if (!entry.did || typeof entry.did !== "string") {
    cliError(`[bindings.${name}] is missing required field "did"`);
  }
  if (entry.out != null && typeof entry.out !== "string") {
    cliError(`[bindings.${name}].out must be a string path`);
  }
}

interface Destination {
  fsPath: string;
  display: string;
}

function resolveBindingDestination(
  name: string,
  entry: BindingConfig,
  outputFlag: string | undefined,
  rootDir: string,
): Destination {
  if (outputFlag) {
    return resolveOutputPath(outputFlag, rootDir);
  }
  if (entry.out) {
    return resolveOutputPath(resolveConfigPath(entry.out), rootDir, entry.out);
  }
  const didDir = path.dirname(entry.did).replace(/\\/g, "/");
  const projectRel =
    didDir === "." || didDir === "" ? `${name}.mo` : `${didDir}/${name}.mo`;
  return resolveOutputPath(resolveConfigPath(projectRel), rootDir, projectRel);
}

function resolveOutputPath(
  fsPath: string,
  rootDir: string,
  display?: string,
): Destination {
  const absPath = path.resolve(fsPath);
  const projectRoot = rootDir || process.cwd();
  const dotMopsDir = path.resolve(projectRoot, ".mops");
  if (absPath === dotMopsDir || absPath.startsWith(dotMopsDir + path.sep)) {
    cliError(
      `Refusing to write Motoko bindings inside .mops/ (private build cache): ${fsPath}\n` +
        "Choose a path outside .mops/ — it should be importable source.",
    );
  }
  return {
    fsPath,
    display: display ?? fsPath,
  };
}

async function readDidFile(fsPath: string): Promise<string> {
  try {
    return await readFile(fsPath, "utf8");
  } catch {
    cliError(`Candid file not found: ${fsPath}`);
  }
}
