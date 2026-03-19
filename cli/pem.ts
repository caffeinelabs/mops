import fs from "node:fs";
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { Secp256k1KeyIdentity } from "@icp-sdk/core/identity/secp256k1";
import pemfile from "pem-file";

export function decodeFile(file: string, password?: string) {
  let rawKey = fs.readFileSync(file);
  if (password) {
    return decode(decrypt(rawKey, password));
  }
  return decode(rawKey);
}

function decode(rawKey: Buffer) {
  let buf: Buffer = pemfile.decode(rawKey);
  if (rawKey.includes("EC PRIVATE KEY")) {
    if (buf.length != 118) {
      throw "expecting byte length 118 but got " + buf.length;
    }
    return Secp256k1KeyIdentity.fromSecretKey(buf.subarray(7, 39));
  }
  if (buf.length != 85) {
    throw "expecting byte length 85 but got " + buf.length;
  }
  let secretKey = Buffer.concat([buf.subarray(16, 48)]);
  return Ed25519KeyIdentity.fromSecretKey(secretKey);
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
