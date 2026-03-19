import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { getWasmBindings } from "../wasm.js";

export async function isCandidCompatible(
  newPath: string,
  originalPath: string,
): Promise<boolean> {
  try {
    await access(newPath);
  } catch {
    throw new Error(`Candid file not found: ${newPath}`);
  }
  try {
    await access(originalPath);
  } catch {
    throw new Error(`Candid file not found: ${originalPath}`);
  }
  const newText = await readFile(path.resolve(newPath), "utf8");
  const originalText = await readFile(path.resolve(originalPath), "utf8");
  return getWasmBindings().is_candid_compatible(newText, originalText);
}
