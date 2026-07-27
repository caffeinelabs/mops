import fs from "node:fs";
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { Secp256k1KeyIdentity } from "@icp-sdk/core/identity/secp256k1";

export function decodeFile(file: string, password?: string) {
  let rawKey = fs.readFileSync(file);
  if (password) {
    let decrypted = decrypt(rawKey, password);
    let identity = decodePem(decrypted);
    if (!hasMagic(rawKey)) {
      // legacy sha-256/ctr file; re-encrypt with the current format (best-effort)
      try {
        fs.writeFileSync(file, encrypt(decrypted, password));
      } catch {}
    }
    return identity;
  }
  return decodePem(rawKey);
}

export function decodePem(rawKey: Buffer | string) {
  let key: crypto.KeyObject;
  try {
    key = crypto.createPrivateKey(rawKey);
  } catch (err) {
    throw new Error(
      "failed to parse PEM data" +
        (err instanceof Error ? ": " + err.message : ""),
    );
  }
  let jwk: crypto.JsonWebKey;
  try {
    jwk = key.export({ format: "jwk" });
  } catch {
    // key types JWK can't represent (dsa, dh, exotic ec curves)
    throw new Error(
      "unsupported key type '" +
        key.asymmetricKeyType +
        "', supported: secp256k1, Ed25519",
    );
  }
  if (!jwk.d) {
    throw new Error("not a private key");
  }
  let secretKey = Buffer.from(jwk.d, "base64url");
  if (key.asymmetricKeyType === "ed25519") {
    return Ed25519KeyIdentity.fromSecretKey(secretKey);
  }
  if (key.asymmetricKeyType === "ec" && jwk.crv === "secp256k1") {
    return Secp256k1KeyIdentity.fromSecretKey(secretKey);
  }
  throw new Error(
    "unsupported key type '" +
      (jwk.crv || key.asymmetricKeyType) +
      "', supported: secp256k1, Ed25519",
  );
}

// v1 file layout: magic | 16-byte salt | 12-byte iv | 16-byte gcm auth tag | ciphertext.
// Files without the magic header use the legacy scheme: 16-byte iv | aes-256-ctr ciphertext
// with the key derived from an unsalted sha-256 of the password (fast to brute-force,
// so kept for decryption only).
let magic = Buffer.from("MOPSENCv1");
let saltLength = 16;
let ivLength = 12;
let authTagLength = 16;
// N=2^17 keeps a single derivation around ~100ms; maxmem must exceed 128 * N * r
let scryptOptions = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

function hasMagic(buffer: Buffer): boolean {
  return buffer.subarray(0, magic.length).equals(magic);
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.scryptSync(password, salt, 32, scryptOptions);
}

export function encrypt(buffer: Buffer, password: string): Buffer {
  let salt = crypto.randomBytes(saltLength);
  let key = deriveKey(password, salt);
  let iv = crypto.randomBytes(ivLength);
  let cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([magic, salt, iv, cipher.getAuthTag(), ciphertext]);
}

export function decrypt(encrypted: Buffer, password: string): Buffer {
  if (!hasMagic(encrypted)) {
    return decryptLegacy(encrypted, password);
  }
  let saltEnd = magic.length + saltLength;
  let ivEnd = saltEnd + ivLength;
  let authTagEnd = ivEnd + authTagLength;
  let key = deriveKey(password, encrypted.subarray(magic.length, saltEnd));
  let decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    encrypted.subarray(saltEnd, ivEnd),
  );
  decipher.setAuthTag(encrypted.subarray(ivEnd, authTagEnd));
  return Buffer.concat([
    decipher.update(encrypted.subarray(authTagEnd)),
    decipher.final(),
  ]);
}

function decryptLegacy(encrypted: Buffer, password: string) {
  let key = crypto
    .createHash("sha256")
    .update(password)
    .digest("base64")
    .slice(0, 32);
  let iv = encrypted.subarray(0, 16);
  let decipher = crypto.createDecipheriv("aes-256-ctr", key, iv);
  return Buffer.concat([
    decipher.update(encrypted.subarray(16)),
    decipher.final(),
  ]);
}
