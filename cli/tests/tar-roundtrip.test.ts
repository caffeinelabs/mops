import { describe, expect, test, afterAll } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { create as tarCreate } from "tar";
import { Parser as TarParser, type ReadEntry } from "tar";

const SAMPLE_FILES: Record<string, string> = {
  "mops.toml": '[package]\nname = "test-pkg"\nversion = "1.0.0"\n',
  "README.md": "# test-pkg\nA test package.\n",
  "src/lib.mo": 'module {\n  public func hello() : Text { "world" };\n};\n',
};

let tmpDir: string;

function setup(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tar-roundtrip-"));
  for (const [relPath, content] of Object.entries(SAMPLE_FILES)) {
    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return tmpDir;
}

afterAll(() => {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

async function extractTarGz(
  archiveBuffer: Uint8Array,
): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  await new Promise<void>((resolve, reject) => {
    const parser = new TarParser();
    parser.on("entry", (entry: ReadEntry) => {
      const chunks: Buffer[] = [];
      entry.on("data", (chunk: Buffer) => chunks.push(chunk));
      entry.on("end", () => {
        const data = Buffer.concat(chunks);
        files.set(entry.path, data.toString("utf-8"));
      });
    });
    parser.on("end", resolve);
    parser.on("error", reject);
    parser.write(Buffer.from(archiveBuffer));
    parser.end();
  });

  return files;
}

describe("tar.gz round-trip (publish -> download contract)", () => {
  test("archive and extract preserves file paths and contents", async () => {
    const dir = setup();
    const archivePath = path.join(dir, "archive.tar.gz");

    await tarCreate(
      {
        gzip: true,
        file: archivePath,
        cwd: dir,
        portable: true,
      },
      Object.keys(SAMPLE_FILES),
    );

    const archiveData = new Uint8Array(fs.readFileSync(archivePath));
    expect(archiveData.length).toBeGreaterThan(0);

    const extracted = await extractTarGz(archiveData);

    expect(extracted.size).toBe(Object.keys(SAMPLE_FILES).length);

    for (const [relPath, expectedContent] of Object.entries(SAMPLE_FILES)) {
      expect(extracted.has(relPath)).toBe(true);
      expect(extracted.get(relPath)).toBe(expectedContent);
    }
  });

  test("nested directories are preserved", async () => {
    const dir = setup();
    const archivePath = path.join(dir, "archive.tar.gz");

    await tarCreate(
      { gzip: true, file: archivePath, cwd: dir, portable: true },
      Object.keys(SAMPLE_FILES),
    );

    const archiveData = new Uint8Array(fs.readFileSync(archivePath));
    const extracted = await extractTarGz(archiveData);

    expect(extracted.has("src/lib.mo")).toBe(true);
  });

  test("archive is valid gzip (starts with gzip magic bytes)", async () => {
    const dir = setup();
    const archivePath = path.join(dir, "archive.tar.gz");

    await tarCreate(
      { gzip: true, file: archivePath, cwd: dir, portable: true },
      Object.keys(SAMPLE_FILES),
    );

    const data = fs.readFileSync(archivePath);
    expect(data[0]).toBe(0x1f);
    expect(data[1]).toBe(0x8b);
  });
});
