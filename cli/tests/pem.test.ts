import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Buffer } from "node:buffer";
import { afterAll, describe, expect, test } from "@jest/globals";
import { decodeFile, decodePem, decrypt, encrypt } from "../pem";

// Keys are generated fresh per test run, never persisted, so no key material
// ever lives in git history (avoids tripping secret scanning on committed pems).

function secp256k1Pair() {
  let { privateKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "secp256k1",
  });
  return {
    sec1: privateKey.export({ type: "sec1", format: "pem" }) as string,
    pkcs8: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
  };
}

// dfx exports Ed25519 as PKCS#8 v2 (embeds the public key); most other
// tools (openssl, this test's own PKCS#8 export) produce v1. Build v2
// manually from a v1 key since Node has no direct API for it.
function ed25519Pair() {
  let { privateKey } = crypto.generateKeyPairSync("ed25519");
  let pkcs8V1 = privateKey.export({ type: "pkcs8", format: "pem" }) as string;

  let seed = Buffer.from(
    privateKey.export({ format: "jwk" }).d as string,
    "base64url",
  );
  let pub = crypto
    .createPublicKey(privateKey)
    .export({ format: "der", type: "spki" })
    .subarray(-32);
  let der = Buffer.concat([
    Buffer.from("3053020101300506032b657004220420", "hex"),
    seed,
    Buffer.from("a123032100", "hex"),
    pub,
  ]);
  let pkcs8V2 =
    "-----BEGIN PRIVATE KEY-----\n" +
    der
      .toString("base64")
      .match(/.{1,64}/g)!
      .join("\n") +
    "\n-----END PRIVATE KEY-----\n";

  return { pkcs8V1, pkcs8V2 };
}

// The pre-scrypt encryption scheme (unsalted sha-256 key, aes-256-ctr, no header)
const encryptLegacy = (buffer: Buffer, password: string): Buffer => {
  let key = crypto
    .createHash("sha256")
    .update(password)
    .digest("base64")
    .slice(0, 32);
  let iv = crypto.randomBytes(16);
  let cipher = crypto.createCipheriv("aes-256-ctr", key, iv);
  return Buffer.concat([iv, cipher.update(buffer), cipher.final()]);
};

const magic = Buffer.from("MOPSENCv1");
const hasMagic = (buffer: Buffer) =>
  buffer.subarray(0, magic.length).equals(magic);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mops-pem-test-"));

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("decodePem", () => {
  test("decodes dfx-style secp256k1 SEC1 and icp-cli-style PKCS#8 pem to the same identity", () => {
    let { sec1, pkcs8 } = secp256k1Pair();
    expect(decodePem(pkcs8).getPrincipal().toText()).toBe(
      decodePem(sec1).getPrincipal().toText(),
    );
  });

  test("decodes Ed25519 PKCS#8 v1 and dfx-style v2 pem to the same identity", () => {
    let { pkcs8V1, pkcs8V2 } = ed25519Pair();
    expect(decodePem(pkcs8V2).getPrincipal().toText()).toBe(
      decodePem(pkcs8V1).getPrincipal().toText(),
    );
  });

  test("rejects unsupported curve", () => {
    let { privateKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    let pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    expect(() => decodePem(pem)).toThrow("unsupported key type 'P-256'");
  });

  test("rejects invalid pem data", () => {
    expect(() => decodePem("not a pem")).toThrow("failed to parse PEM data");
  });
});

describe("encrypt/decrypt", () => {
  test("round-trip restores the original data", () => {
    let data = crypto.randomBytes(100);
    let password = crypto.randomBytes(8).toString("hex");
    expect(decrypt(encrypt(data, password), password).equals(data)).toBe(true);
  });

  test("encrypted data starts with the format magic header", () => {
    let encrypted = encrypt(Buffer.from("data"), "password");
    expect(hasMagic(encrypted)).toBe(true);
  });

  test("uses a fresh salt and iv for every call", () => {
    let data = Buffer.from("data");
    let a = encrypt(data, "password");
    let b = encrypt(data, "password");
    expect(a.equals(b)).toBe(false);
  });

  test("wrong password throws", () => {
    let encrypted = encrypt(Buffer.from("data"), "password");
    expect(() => decrypt(encrypted, "wrong")).toThrow();
  });

  test("tampered ciphertext throws", () => {
    let encrypted = encrypt(Buffer.from("data"), "password");
    let last = encrypted.length - 1;
    encrypted.writeUInt8(encrypted.readUInt8(last) ^ 0xff, last);
    expect(() => decrypt(encrypted, "password")).toThrow();
  });

  test("decrypts legacy sha-256/ctr files", () => {
    let data = crypto.randomBytes(100);
    let password = crypto.randomBytes(8).toString("hex");
    expect(decrypt(encryptLegacy(data, password), password).equals(data)).toBe(
      true,
    );
  });
});

describe("decodeFile", () => {
  test("decodes an encrypted pem file", () => {
    let pem = secp256k1Pair().sec1;
    let password = crypto.randomBytes(8).toString("hex");
    let file = path.join(tempDir, "identity.pem.encrypted");
    fs.writeFileSync(file, encrypt(Buffer.from(pem), password));

    let identity = decodeFile(file, password);
    expect(identity.getPrincipal().toText()).toBeTruthy();
  });

  test("upgrades legacy files to the current format on successful decode", () => {
    let pem = secp256k1Pair().sec1;
    let password = crypto.randomBytes(8).toString("hex");
    let file = path.join(tempDir, "legacy.pem.encrypted");
    fs.writeFileSync(file, encryptLegacy(Buffer.from(pem), password));

    let identity = decodeFile(file, password);
    let upgraded = fs.readFileSync(file);
    expect(hasMagic(upgraded)).toBe(true);

    // still decodes after the upgrade, to the same identity
    let identityAfter = decodeFile(file, password);
    expect(identityAfter.getPrincipal().toText()).toBe(
      identity.getPrincipal().toText(),
    );
  });

  test("wrong password on a legacy file throws and leaves the file untouched", () => {
    let pem = secp256k1Pair().sec1;
    let file = path.join(tempDir, "legacy-wrong.pem.encrypted");
    let original = encryptLegacy(Buffer.from(pem), "password");
    fs.writeFileSync(file, original);

    expect(() => decodeFile(file, "wrong")).toThrow();
    expect(fs.readFileSync(file).equals(original)).toBe(true);
  });
});
