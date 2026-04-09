import { describe, expect, test } from "@jest/globals";
import {
  buildMerkleTree,
  splitChunks,
  chunkHash,
  nodeHash,
  metadataHash,
  hashToShaString,
} from "../api/storageClient";

const CHUNK_SIZE = 1024 * 1024; // 1 MiB — must match storageClient.ts

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    buf[i] = (i * 137 + 43) & 0xff;
  }
  return buf;
}

describe("splitChunks", () => {
  test("single byte produces one chunk", () => {
    const chunks = splitChunks(new Uint8Array([42]));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(new Uint8Array([42]));
  });

  test("exactly 1 MiB produces one chunk", () => {
    const data = randomBytes(CHUNK_SIZE);
    const chunks = splitChunks(data);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.length).toBe(CHUNK_SIZE);
  });

  test("1 MiB + 1 byte produces two chunks", () => {
    const data = randomBytes(CHUNK_SIZE + 1);
    const chunks = splitChunks(data);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.length).toBe(CHUNK_SIZE);
    expect(chunks[1]!.length).toBe(1);
  });

  test("3 MiB exactly produces three chunks", () => {
    const data = randomBytes(CHUNK_SIZE * 3);
    const chunks = splitChunks(data);
    expect(chunks).toHaveLength(3);
    for (const c of chunks) {
      expect(c.length).toBe(CHUNK_SIZE);
    }
  });
});

describe("chunkHash", () => {
  test("is deterministic", () => {
    const data = new Uint8Array([1, 2, 3]);
    expect(chunkHash(data)).toEqual(chunkHash(data));
  });

  test("different data produces different hash", () => {
    const a = chunkHash(new Uint8Array([1]));
    const b = chunkHash(new Uint8Array([2]));
    expect(a).not.toEqual(b);
  });

  test("returns 32 bytes (SHA-256)", () => {
    expect(chunkHash(new Uint8Array([0])).length).toBe(32);
  });
});

describe("nodeHash", () => {
  test("is deterministic", () => {
    const left = new Uint8Array(32).fill(0xaa);
    const right = new Uint8Array(32).fill(0xbb);
    expect(nodeHash(left, right)).toEqual(nodeHash(left, right));
  });

  test("order matters", () => {
    const left = new Uint8Array(32).fill(0xaa);
    const right = new Uint8Array(32).fill(0xbb);
    expect(nodeHash(left, right)).not.toEqual(nodeHash(right, left));
  });

  test("null right (unbalanced) produces valid hash", () => {
    const left = new Uint8Array(32).fill(0xcc);
    const hash = nodeHash(left, null);
    expect(hash.length).toBe(32);
  });

  test("null left (unbalanced) produces valid hash", () => {
    const right = new Uint8Array(32).fill(0xdd);
    const hash = nodeHash(null, right);
    expect(hash.length).toBe(32);
  });

  test("null left != null right for same sibling", () => {
    const child = new Uint8Array(32).fill(0xee);
    expect(nodeHash(child, null)).not.toEqual(nodeHash(null, child));
  });
});

describe("metadataHash", () => {
  test("is deterministic", () => {
    const headers = { "Content-Type": "text/plain", "Content-Length": "42" };
    expect(metadataHash(headers)).toEqual(metadataHash(headers));
  });

  test("header order does not matter (sorted internally)", () => {
    const a = metadataHash({
      "Content-Length": "10",
      "Content-Type": "text/plain",
    });
    const b = metadataHash({
      "Content-Type": "text/plain",
      "Content-Length": "10",
    });
    expect(a).toEqual(b);
  });

  test("different values produce different hash", () => {
    const a = metadataHash({ "Content-Type": "text/plain" });
    const b = metadataHash({ "Content-Type": "application/gzip" });
    expect(a).not.toEqual(b);
  });
});

describe("hashToShaString", () => {
  test("produces sha256: prefix with hex", () => {
    const hash = new Uint8Array(32).fill(0);
    const str = hashToShaString(hash);
    expect(str).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test("all-zero hash", () => {
    const hash = new Uint8Array(32).fill(0);
    expect(hashToShaString(hash)).toBe(
      "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    );
  });

  test("all-ff hash", () => {
    const hash = new Uint8Array(32).fill(0xff);
    expect(hashToShaString(hash)).toBe(
      "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    );
  });
});

describe("domain separation", () => {
  test("chunkHash != nodeHash for same 32-byte input", () => {
    const data = new Uint8Array(32).fill(0xab);
    const ch = chunkHash(data);
    const nh = nodeHash(data, null);
    expect(ch).not.toEqual(nh);
  });

  test("chunkHash != metadataHash for overlapping content", () => {
    const data = new TextEncoder().encode("Content-Type: text/plain\n");
    const ch = chunkHash(data);
    const mh = metadataHash({ "Content-Type": "text/plain" });
    expect(ch).not.toEqual(mh);
  });
});

describe("buildMerkleTree", () => {
  test("throws on empty data", () => {
    expect(() =>
      buildMerkleTree(new Uint8Array(0), "application/gzip"),
    ).toThrow("empty");
  });

  test("single-chunk file", () => {
    const data = randomBytes(100);
    const result = buildMerkleTree(data, "application/gzip");

    expect(result.chunks).toHaveLength(1);
    expect(result.chunkHashes).toHaveLength(1);
    expect(result.blobTree.tree_type).toBe("DSBMTWH");
    expect(result.blobTree.chunk_hashes).toHaveLength(1);
    expect(result.rootHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    // tree root has left (chunks subtree) and right (metadata)
    expect(result.blobTree.tree.left).not.toBeNull();
    expect(result.blobTree.tree.right).not.toBeNull();
  });

  test("multi-chunk file", () => {
    const data = randomBytes(CHUNK_SIZE * 3 + 500);
    const result = buildMerkleTree(data, "application/gzip");

    expect(result.chunks).toHaveLength(4);
    expect(result.chunkHashes).toHaveLength(4);
    expect(result.blobTree.chunk_hashes).toHaveLength(4);
  });

  test("headers are sorted and contain Content-Type and Content-Length", () => {
    const data = randomBytes(42);
    const result = buildMerkleTree(data, "application/gzip");

    expect(result.blobTree.headers).toHaveLength(2);
    // sorted: Content-Length before Content-Type
    expect(result.blobTree.headers[0]).toMatch(/^Content-Length: 42$/);
    expect(result.blobTree.headers[1]).toMatch(
      /^Content-Type: application\/gzip$/,
    );
  });

  test("determinism: same input produces same rootHash", () => {
    const data = randomBytes(5000);
    const a = buildMerkleTree(data, "application/gzip");
    const b = buildMerkleTree(data, "application/gzip");
    expect(a.rootHash).toBe(b.rootHash);
    expect(a.blobTree.tree.hash).toBe(b.blobTree.tree.hash);
  });

  test("different data produces different rootHash", () => {
    const a = buildMerkleTree(randomBytes(100), "application/gzip");
    const b = buildMerkleTree(
      new Uint8Array(100).fill(0xff),
      "application/gzip",
    );
    expect(a.rootHash).not.toBe(b.rootHash);
  });

  test("different content type produces different rootHash", () => {
    const data = randomBytes(100);
    const a = buildMerkleTree(data, "application/gzip");
    const b = buildMerkleTree(data, "text/plain");
    expect(a.rootHash).not.toBe(b.rootHash);
  });

  test("chunk hashes in blobTree match chunkHashes array", () => {
    const data = randomBytes(CHUNK_SIZE + 500);
    const result = buildMerkleTree(data, "application/gzip");

    for (let i = 0; i < result.chunkHashes.length; i++) {
      expect(result.blobTree.chunk_hashes[i]).toBe(
        hashToShaString(result.chunkHashes[i]!),
      );
    }
  });
});
