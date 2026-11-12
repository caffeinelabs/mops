// Formats the `.mo` files lint-staged passes with the mo-fmt pinned in mops.toml.
// `mops format` takes a filter, not a file list, so it would format the whole tree.
import { execFileSync } from "node:child_process";
import process from "node:process";

let bin;
try {
  bin = execFileSync("mops", ["toolchain", "bin", "mo-fmt"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
} catch {
  console.error("Formatting .mo files needs mops 3.4.2 or later on PATH.");
  process.exit(1);
}

try {
  execFileSync(bin, ["--", ...process.argv.slice(2)], { stdio: "inherit" });
} catch (err) {
  process.exit(err.status ?? 1);
}
