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

async function extractTarGzRaw(
  archiveBuffer: Uint8Array,
): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();

  await new Promise<void>((resolve, reject) => {
    const parser = new TarParser();
    parser.on("entry", (entry: ReadEntry) => {
      const chunks: Buffer[] = [];
      entry.on("data", (chunk: Buffer) => chunks.push(chunk));
      entry.on("end", () => {
        files.set(entry.path, Buffer.concat(chunks));
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

  test("binary content is preserved without corruption", async () => {
    const dir = setup();

    const binaryData = Buffer.alloc(512);
    for (let i = 0; i < 512; i++) {
      binaryData[i] = i & 0xff;
    }
    fs.writeFileSync(path.join(dir, "binary.bin"), binaryData);

    const archivePath = path.join(dir, "archive.tar.gz");
    await tarCreate(
      { gzip: true, file: archivePath, cwd: dir, portable: true },
      ["binary.bin"],
    );

    const archiveData = new Uint8Array(fs.readFileSync(archivePath));
    const extracted = await extractTarGzRaw(archiveData);

    expect(extracted.has("binary.bin")).toBe(true);
    const extractedBuf = extracted.get("binary.bin")!;
    expect(extractedBuf.length).toBe(512);
    for (let i = 0; i < 512; i++) {
      expect(extractedBuf[i]).toBe(i & 0xff);
    }
  });

  test("deeply nested paths are preserved", async () => {
    const dir = setup();

    const deepPath = "a/b/c/d/e/deep.mo";
    const fullPath = path.join(dir, deepPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, "module {};\n");

    const archivePath = path.join(dir, "archive.tar.gz");
    await tarCreate(
      { gzip: true, file: archivePath, cwd: dir, portable: true },
      [deepPath],
    );

    const archiveData = new Uint8Array(fs.readFileSync(archivePath));
    const extracted = await extractTarGz(archiveData);

    expect(extracted.has(deepPath)).toBe(true);
    expect(extracted.get(deepPath)).toBe("module {};\n");
  });

  test("empty file is preserved", async () => {
    const dir = setup();

    fs.writeFileSync(path.join(dir, "empty.txt"), "");

    const archivePath = path.join(dir, "archive.tar.gz");
    await tarCreate(
      { gzip: true, file: archivePath, cwd: dir, portable: true },
      ["empty.txt"],
    );

    const archiveData = new Uint8Array(fs.readFileSync(archivePath));
    const extracted = await extractTarGz(archiveData);

    expect(extracted.has("empty.txt")).toBe(true);
    expect(extracted.get("empty.txt")).toBe("");
  });

  test("UTF-8 content is preserved", async () => {
    const dir = setup();
    const utf8Content = "Hello 世界 🌍 café ñ";
    fs.writeFileSync(path.join(dir, "utf8.txt"), utf8Content);

    const archivePath = path.join(dir, "archive.tar.gz");
    await tarCreate(
      { gzip: true, file: archivePath, cwd: dir, portable: true },
      ["utf8.txt"],
    );

    const archiveData = new Uint8Array(fs.readFileSync(archivePath));
    const extracted = await extractTarGz(archiveData);

    expect(extracted.get("utf8.txt")).toBe(utf8Content);
  });
});
