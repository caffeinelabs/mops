import { describe, expect, test, jest, afterAll } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { create as tarCreate } from "tar";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { uploadBlob, downloadBlob } from "../api/storageClient";
import { cli } from "./helpers";

const E2E_ENABLED = Boolean(process.env.MOPS_TEST_E2E);
const E2E_PUBLISH_ENABLED =
  E2E_ENABLED && Boolean(process.env.MOPS_IDENTITY_PEM);

const describeE2E = E2E_ENABLED ? describe : describe.skip;
const describePublish = E2E_PUBLISH_ENABLED ? describe : describe.skip;

jest.setTimeout(180_000);

// Staging network -- all E2E tests target the staging registry so that IC
// response certificates are valid and the real Caffeine gateway accepts them.
const STAGING_ENV = {
  MOPS_NETWORK: "staging",
};

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

async function createSmallTarGz(): Promise<Uint8Array> {
  const dir = makeTmpDir("e2e-blob-upload-");
  tmpDirs.push(dir);

  fs.writeFileSync(
    path.join(dir, "mops.toml"),
    '[package]\nname = "dummy"\nversion = "0.0.1"\n',
  );
  fs.writeFileSync(path.join(dir, "README.md"), "# dummy\n");
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src/lib.mo"), "module {};\n");

  const archivePath = path.join(dir, "archive.tar.gz");
  await tarCreate({ gzip: true, file: archivePath, cwd: dir, portable: true }, [
    "mops.toml",
    "README.md",
    "src/lib.mo",
  ]);
  return new Uint8Array(fs.readFileSync(archivePath));
}

// ---------------------------------------------------------------------------
// Test A: Programmatic upload → download round-trip
// ---------------------------------------------------------------------------
describeE2E("E2E: blob upload/download round-trip", () => {
  test("upload to gateway then download returns identical bytes", async () => {
    const archiveData = await createSmallTarGz();
    const identity = Ed25519KeyIdentity.generate();

    const rootHash = await uploadBlob(archiveData, identity);
    expect(rootHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    const downloaded = await downloadBlob(rootHash);
    expect(Buffer.from(downloaded)).toEqual(Buffer.from(archiveData));
  });

  test("uploading the same content twice returns the same hash (content-addressed)", async () => {
    const archiveData = await createSmallTarGz();
    const identity = Ed25519KeyIdentity.generate();

    const hash1 = await uploadBlob(archiveData, identity);
    const hash2 = await uploadBlob(archiveData, identity);
    expect(hash1).toBe(hash2);
  });

  test("onProgress callback is called during upload", async () => {
    const archiveData = await createSmallTarGz();
    const identity = Ed25519KeyIdentity.generate();

    const progressValues: number[] = [];
    await uploadBlob(archiveData, identity, (pct) => progressValues.push(pct));

    expect(progressValues.length).toBeGreaterThan(0);
    expect(progressValues[progressValues.length - 1]).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Test B: Full CLI publish + install round-trip
// ---------------------------------------------------------------------------
describePublish("E2E: blob publish + install round-trip", () => {
  const fixtureSrc = path.join(import.meta.dirname, "e2e-blob-publish");
  const uniqueVersion = `0.0.${Date.now() % 100000}`;

  let publishDir: string;
  let installDir: string;

  test("publish a package via blob storage", async () => {
    publishDir = makeTmpDir("e2e-blob-pub-");
    tmpDirs.push(publishDir);

    // Write identity PEM to the mops config dir
    const mopsConfigDir =
      process.platform === "darwin"
        ? path.join(os.homedir(), "Library/Application Support/mops")
        : path.join(
            process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
            "mops",
          );
    fs.mkdirSync(mopsConfigDir, { recursive: true });
    const pemPath = path.join(mopsConfigDir, "identity.pem");
    const hadPem = fs.existsSync(pemPath);
    let oldPem: Buffer | undefined;
    if (hadPem) {
      oldPem = fs.readFileSync(pemPath);
    }

    try {
      fs.writeFileSync(pemPath, process.env.MOPS_IDENTITY_PEM!);

      // Copy fixture and patch version
      fs.cpSync(fixtureSrc, publishDir, { recursive: true });
      const toml = fs
        .readFileSync(path.join(publishDir, "mops.toml"), "utf-8")
        .replace('version = "0.0.0"', `version = "${uniqueVersion}"`);
      fs.writeFileSync(path.join(publishDir, "mops.toml"), toml);

      const result = await cli(["publish"], {
        cwd: publishDir,
        env: STAGING_ENV,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout + result.stderr).toMatch(/Published/i);
    } finally {
      if (hadPem && oldPem) {
        fs.writeFileSync(pemPath, oldPem);
      } else if (!hadPem) {
        fs.rmSync(pemPath, { force: true });
      }
    }
  });

  test("install the published package via blob storage", async () => {
    installDir = makeTmpDir("e2e-blob-inst-");
    tmpDirs.push(installDir);

    fs.writeFileSync(
      path.join(installDir, "mops.toml"),
      `[package]\nname = "e2e-consumer"\nversion = "0.0.1"\n\n[dependencies]\n__e2e-blob-test = "${uniqueVersion}"\n`,
    );

    const result = await cli(["install"], {
      cwd: installDir,
      env: STAGING_ENV,
    });
    expect(result.exitCode).toBe(0);

    // Verify files exist in .mops
    const pkgDir = path.join(
      installDir,
      ".mops",
      `__e2e-blob-test@${uniqueVersion}`,
    );
    expect(fs.existsSync(path.join(pkgDir, "src/lib.mo"))).toBe(true);
    expect(fs.existsSync(path.join(pkgDir, "README.md"))).toBe(true);

    // Verify lock file has blobHashes
    const lockPath = path.join(installDir, "mops.lock");
    expect(fs.existsSync(lockPath)).toBe(true);
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    expect(lock.version).toBe(4);
    expect(lock.blobHashes).toBeDefined();
    expect(lock.blobHashes[`__e2e-blob-test@${uniqueVersion}`]).toMatch(
      /^sha256:/,
    );
  });
});
