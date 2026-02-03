import path from "node:path";
import { globalCacheDir, readConfig } from "../mops.js";

export function getLintokoBinPath(): string {
  let config = readConfig();
  let version = config.toolchain?.lintoko;
  if (version) {
    return path.join(globalCacheDir, "lintoko", version, "lintoko");
  }
  return "lintoko";
}
