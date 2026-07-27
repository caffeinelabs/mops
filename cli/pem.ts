import fs from "node:fs";
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { Secp256k1KeyIdentity } from "@icp-sdk/core/identity/secp256k1";

export function decodeFile(file: string, password?: string) {
  let rawKey = fs.readFileSync(file);
  if (password) {
    return decodePem(decrypt(rawKey, password));
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

let algorithm = "aes-256-ctr";

export function encrypt(buffer: Buffer, password: string) {
  let key = crypto
    .createHash("sha256")
    .update(password)
    .digest("base64")
    .slice(0, 32);
  // Create an initialization vector
  let iv = crypto.randomBytes(16);
  // Create a new cipher using the algorithm, key, and iv
  let cipher = crypto.createCipheriv(algorithm, key, iv);
  // Create the new (encrypted) buffer
  let result = Buffer.concat([iv, cipher.update(buffer), cipher.final()]);
  return result;
}

function decrypt(encrypted: Buffer, password: string) {
  let key = crypto
    .createHash("sha256")
    .update(password)
    .digest("base64")
    .slice(0, 32);
  // Get the iv: the first 16 bytes
  let iv = encrypted.subarray(0, 16);
  // Get the rest
  encrypted = encrypted.subarray(16);
  // Create a decipher
  let decipher = crypto.createDecipheriv(algorithm, key, iv);
  // Actually decrypt it
  let result = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return result;
}
