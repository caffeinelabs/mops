import crypto from "node:crypto";
import { describe, expect, test } from "@jest/globals";
import { decodePem } from "../pem";

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
