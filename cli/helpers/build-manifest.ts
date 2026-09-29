import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { checkEmptyBaselineCompatibility } from "./empty-baseline.js";
import { getMocVersion } from "./get-moc-version.js";

// Unstable feature — schema documented only in docs/docs/11-unstable.md.
const MANIFEST_VERSION = 1;

async function sha256(filePath: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}

export interface BuildManifestParams {
  canisterName: string;
  mocPath: string;
  wasmPath: string;
  /** The moc-generated .did — the one on disk next to the wasm, which may
   * differ from the declared `candid` embedded into the wasm. */
  didPath: string;
  mostPath: string;
  verbose?: boolean;
}

/**
 * Write `<canister>.build.json` next to the built artifacts. The
 * stable-compatibility check outcome is recorded, never gates the build.
 */
export async function writeBuildManifest(
  params: BuildManifestParams,
): Promise<string> {
  const { canisterName, mocPath, wasmPath, didPath, mostPath } = params;

  const { compatible, exitCode, compilerOutput } =
    await checkEmptyBaselineCompatibility(mocPath, mostPath, {
      verbose: params.verbose,
    });
  // A check that never ran must not be recorded as an upgrade-only wasm.
  if (exitCode === undefined) {
    throw new Error(
      `stable-compatibility check failed to run${compilerOutput ? `:\n${compilerOutput}` : ""}`,
    );
  }

  const manifest = {
    version: MANIFEST_VERSION,
    canister: canisterName,
    moc: getMocVersion() || null,
    outputs: {
      wasm: { path: basename(wasmPath), sha256: await sha256(wasmPath) },
      did: { path: basename(didPath), sha256: await sha256(didPath) },
      most: { path: basename(mostPath), sha256: await sha256(mostPath) },
    },
    checks: [
      {
        name: "stable-compatibility",
        baseline: "empty",
        passed: compatible,
      },
    ],
  };

  const manifestPath = buildManifestPath(dirname(wasmPath), canisterName);
  // Written last as the "artifacts are final" signal; rename keeps a watcher
  // from ever observing truncated JSON.
  const tmpPath = manifestPath + ".tmp";
  await writeFile(tmpPath, JSON.stringify(manifest, null, 2) + "\n");
  await rename(tmpPath, manifestPath);
  return manifestPath;
}

export function buildManifestPath(
  outputDir: string,
  canisterName: string,
): string {
  return join(outputDir, `${canisterName}.build.json`);
}
