import { afterAll, describe, expect, test } from "@jest/globals";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Buffer } from "node:buffer";
import { decodeFile, decrypt, encrypt } from "../pem";

// Generated at runtime so no key material is committed to the repo
const generatePem = (): string => {
  let { privateKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "secp256k1",
  });
  return privateKey.export({ type: "sec1", format: "pem" }).toString();
};

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
    let pem = generatePem();
    let password = crypto.randomBytes(8).toString("hex");
    let file = path.join(tempDir, "identity.pem.encrypted");
    fs.writeFileSync(file, encrypt(Buffer.from(pem), password));

    let identity = decodeFile(file, password);
    expect(identity.getPrincipal().toText()).toBeTruthy();
  });

  test("upgrades legacy files to the current format on successful decode", () => {
    let pem = generatePem();
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
    let pem = generatePem();
    let file = path.join(tempDir, "legacy-wrong.pem.encrypted");
    let original = encryptLegacy(Buffer.from(pem), "password");
    fs.writeFileSync(file, original);

    expect(() => decodeFile(file, "wrong")).toThrow();
    expect(fs.readFileSync(file).equals(original)).toBe(true);
  });
});
