import { globSync } from "glob";
import { isNestedCheckout, MOTOKO_GLOB_CONFIG } from "../../constants.js";

export function globMoFiles(rootDir: string) {
  return globSync("**/*.mo", { cwd: rootDir, ...MOTOKO_GLOB_CONFIG }).filter(
    (file) => !isNestedCheckout(file, rootDir),
  );
}
