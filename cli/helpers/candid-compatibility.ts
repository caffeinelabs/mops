import { readFile } from "node:fs/promises";
import { getWasmBindings } from "../wasm.js";

async function readCandid(candidPath: string): Promise<string> {
  try {
    return await readFile(candidPath, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      throw new Error(`Candid file not found: ${candidPath}`);
    }
    throw err;
  }
}

/**
 * Why the interface at `newPath` cannot replace the one at `originalPath`, or
 * `null` when it is a compatible subtype.
 */
export async function checkCandidCompatibility(
  newPath: string,
  originalPath: string,
): Promise<string | null> {
  const [newText, originalText] = await Promise.all([
    readCandid(newPath),
    readCandid(originalPath),
  ]);
  return (
    getWasmBindings().check_candid_compatibility(newText, originalText) ?? null
  );
}
