import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";

// Extracts a GitHub source archive: entries all live under a single
// `<repo>-<ref>/` root, which is stripped, like `tar --strip-components=1`.
//
// The zip comes from a user-specified repo, so entry names are attacker
// input. Anything that would land outside `dest` (a `..` segment, an
// absolute path) fails the whole extraction. Symlink entries are written as
// regular files holding the link target — a link pointing outside `dest`
// must not be followed by whatever consumes the package later.
export function extractGithubZip(zipFile: string, dest: string): string[] {
  let entries = unzipSync(new Uint8Array(readFileSync(zipFile)));
  let written: string[] = [];

  for (let [name, content] of Object.entries(entries)) {
    if (name.endsWith("/")) {
      continue;
    }
    let parts = name.split("/").filter((part) => part && part !== ".");
    if (parts.includes("..") || path.isAbsolute(name)) {
      throw new Error(
        `Refusing to extract zip entry outside the target directory: ${JSON.stringify(name)}`,
      );
    }

    // Drop the `<repo>-<ref>/` root; a top-level file has nothing left.
    let stripped = parts.slice(1);
    if (!stripped.length) {
      continue;
    }

    let target = path.join(dest, ...stripped);
    let rel = path.relative(dest, target);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(
        `Refusing to extract zip entry outside the target directory: ${JSON.stringify(name)}`,
      );
    }

    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
    written.push(target);
  }

  return written;
}
