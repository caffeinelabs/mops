import { describe, expect, test, afterEach } from "@jest/globals";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { extractGithubZip } from "../helpers/extract-github-zip.js";

let dirs: string[] = [];

function tempDir(): string {
  let dir = mkdtempSync(path.join(os.tmpdir(), "mops-zip-test-"));
  dirs.push(dir);
  return dir;
}

function makeZip(entries: Record<string, string>): string {
  let zipped = zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([name, text]) => [name, strToU8(text)]),
    ),
  );
  let file = path.join(tempDir(), "archive.zip");
  writeFileSync(file, zipped);
  return file;
}

afterEach(() => {
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  dirs = [];
});

describe("extractGithubZip", () => {
  test("strips the top-level directory like a GitHub archive expects", () => {
    let zip = makeZip({
      "repo-abc123/mops.toml": "[package]",
      "repo-abc123/src/lib.mo": "module {}",
    });
    let dest = tempDir();

    let written = extractGithubZip(zip, dest);

    expect(written.sort()).toEqual([
      path.join(dest, "mops.toml"),
      path.join(dest, "src/lib.mo"),
    ]);
    expect(readFileSync(path.join(dest, "src/lib.mo"), "utf8")).toBe(
      "module {}",
    );
  });

  test("rejects entries traversing out of the target directory", () => {
    // zip-slip: the stripped root does not defuse a later `..` segment.
    let zip = makeZip({
      "repo-abc123/../../evil.txt": "pwned",
      "repo-abc123/ok.txt": "fine",
    });
    let dest = tempDir();
    let outside = path.resolve(dest, "../../evil.txt");

    expect(() => extractGithubZip(zip, dest)).toThrow(
      /outside the target directory/,
    );
    expect(existsSync(outside)).toBe(false);
  });

  test("rejects absolute entry names", () => {
    let zip = makeZip({ "/tmp/evil.txt": "pwned" });

    expect(() => extractGithubZip(zip, tempDir())).toThrow(
      /outside the target directory/,
    );
  });

  test("ignores the root's own top-level files and directory entries", () => {
    let zip = makeZip({ "repo-abc123/": "", "top-level-stray": "x" });
    let dest = tempDir();

    expect(extractGithubZip(zip, dest)).toEqual([]);
  });
});
