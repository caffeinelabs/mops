import process from "node:process";
import { execFileSync } from "node:child_process";

export function getMocPath(throwIfNotFound = false): string {
  let mocPath = process.env.DFX_MOC_PATH;
  if (!mocPath) {
    try {
      mocPath =
        execFileSync("dfx", ["cache", "show"]).toString().trim() + "/moc";
    } catch (e) {
      mocPath = "";
    }
  }
  if (!mocPath) {
    mocPath = "moc";
  }

  if (throwIfNotFound) {
    try {
      execFileSync(mocPath, ["--version"]);
    } catch (e) {
      console.error(e);
      throw new Error("moc not found");
    }
  }

  return mocPath;
}
