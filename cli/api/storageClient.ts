import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import {
  HttpAgent,
  type Identity,
  isV3ResponseBody,
} from "@icp-sdk/core/agent";
import { IDL } from "@icp-sdk/core/candid";
import { getEndpoint, getNetwork } from "./network.js";

const SHA256_PREFIX = "sha256:";
const CHUNK_SIZE = 1024 * 1024; // 1 MiB
const MAX_CONCURRENT_UPLOADS = 10;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const FETCH_TIMEOUT_MS = 120_000;
const GATEWAY_VERSION = "v1";

const DOMAIN_CHUNK = new TextEncoder().encode("icfs-chunk/");
const DOMAIN_METADATA = new TextEncoder().encode("icfs-metadata/");
const DOMAIN_NODE = new TextEncoder().encode("ynode/");
const UNBALANCED = new TextEncoder().encode("UNBALANCED");

function domainHash(domainSeparator: Uint8Array, data: Uint8Array): Uint8Array {
  const combined = new Uint8Array(domainSeparator.length + data.length);
  combined.set(domainSeparator);
  combined.set(data, domainSeparator.length);
  return sha256(combined);
}

function chunkHash(data: Uint8Array): Uint8Array {
  return domainHash(DOMAIN_CHUNK, data);
}

function nodeHash(
  left: Uint8Array | null,
  right: Uint8Array | null,
): Uint8Array {
  const leftBytes = left ?? UNBALANCED;
  const rightBytes = right ?? UNBALANCED;
  const combined = new Uint8Array(
    DOMAIN_NODE.length + leftBytes.length + rightBytes.length,
  );
  let offset = 0;
  for (const data of [DOMAIN_NODE, leftBytes, rightBytes]) {
    combined.set(data, offset);
    offset += data.length;
  }
  return sha256(combined);
}

function metadataHash(headers: Record<string, string>): Uint8Array {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(headers)) {
    lines.push(`${key.trim()}: ${value.trim()}\n`);
  }
  lines.sort();
  return domainHash(DOMAIN_METADATA, new TextEncoder().encode(lines.join("")));
}

function hashToShaString(hash: Uint8Array): string {
  return `${SHA256_PREFIX}${bytesToHex(hash)}`;
}

type TreeNode = {
  hash: Uint8Array;
  left: TreeNode | null;
  right: TreeNode | null;
};

type TreeNodeJSON = {
  hash: string;
  left: TreeNodeJSON | null;
  right: TreeNodeJSON | null;
};

function nodeToJSON(node: TreeNode): TreeNodeJSON {
  return {
    hash: hashToShaString(node.hash),
    left: node.left ? nodeToJSON(node.left) : null,
    right: node.right ? nodeToJSON(node.right) : null,
  };
}

type BlobHashTreeJSON = {
  tree_type: "DSBMTWH";
  chunk_hashes: string[];
  tree: TreeNodeJSON;
  headers: string[];
};

function splitChunks(data: Uint8Array): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    chunks.push(data.subarray(i, Math.min(i + CHUNK_SIZE, data.length)));
  }
  return chunks;
}

function buildMerkleTree(
  fileData: Uint8Array,
  contentType: string,
): {
  chunks: Uint8Array[];
  chunkHashes: Uint8Array[];
  blobTree: BlobHashTreeJSON;
  rootHash: string;
} {
  if (fileData.length === 0) {
    throw new Error("Cannot build merkle tree from empty data");
  }

  const chunks = splitChunks(fileData);
  const chunkHashes = chunks.map((c) => chunkHash(c));

  let level: TreeNode[] = chunkHashes.map((h) => ({
    hash: h,
    left: null,
    right: null,
  }));

  while (level.length > 1) {
    const nextLevel: TreeNode[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? null;
      const parent = nodeHash(left.hash, right ? right.hash : null);
      nextLevel.push({ hash: parent, left, right });
    }
    level = nextLevel;
  }

  const chunksRoot = level[0]!;

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Content-Length": fileData.length.toString(),
  };
  const headerLines = Object.entries(headers).map(
    ([k, v]) => `${k.trim()}: ${v.trim()}`,
  );
  headerLines.sort();

  const metaHash = metadataHash(headers);
  const metaNode: TreeNode = { hash: metaHash, left: null, right: null };
  const combinedHash = nodeHash(chunksRoot.hash, metaNode.hash);
  const combinedRoot: TreeNode = {
    hash: combinedHash,
    left: chunksRoot,
    right: metaNode,
  };

  const blobTree: BlobHashTreeJSON = {
    tree_type: "DSBMTWH",
    chunk_hashes: chunkHashes.map(hashToShaString),
    tree: nodeToJSON(combinedRoot),
    headers: headerLines,
  };

  return {
    chunks,
    chunkHashes,
    blobTree,
    rootHash: hashToShaString(combinedRoot.hash),
  };
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === MAX_RETRIES) {
        throw error;
      }
      const delay = Math.min(
        BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 1000,
        30000,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError || new Error("Unknown error during retry");
}

export async function getCertificate(
  identity: Identity,
  rootHash: string,
): Promise<Uint8Array> {
  const network = getNetwork();
  const { host, canisterId } = getEndpoint(network);

  const agent = await HttpAgent.create({
    host,
    identity,
    shouldFetchRootKey: network === "local",
    verifyQuerySignatures: process.env.MOPS_VERIFY_QUERY_SIGNATURES !== "false",
    shouldSyncTime: true,
  });

  const arg = IDL.encode([IDL.Text], [rootHash]);
  const result = await agent.call(canisterId, {
    methodName: "_immutableObjectStorageCreateCertificate",
    arg,
  });
  const body = result.response.body;
  if (isV3ResponseBody(body)) {
    return body.certificate;
  }
  throw new Error("Expected v3 response body with certificate");
}

function fetchWithTimeout(
  url: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timeout),
  );
}

function getGatewayUrl(): string {
  return process.env["MOPS_STORAGE_GATEWAY_URL"] || "https://blob.caffeine.ai";
}

function getProjectId(): string {
  return (
    process.env["MOPS_STORAGE_PROJECT_ID"] ||
    "0000000-0000-0000-0000-00000000000"
  );
}

export async function uploadBlob(
  fileData: Uint8Array,
  identity: Identity,
  onProgress?: (percentage: number) => void,
): Promise<string> {
  const { chunks, chunkHashes, blobTree, rootHash } = buildMerkleTree(
    fileData,
    "application/gzip",
  );

  const certificateBytes = await getCertificate(identity, rootHash);

  const gatewayUrl = getGatewayUrl();
  const network = getNetwork();
  const { canisterId } = getEndpoint(network);
  const projectId = getProjectId();

  await withRetry(async () => {
    const url = `${gatewayUrl}/${GATEWAY_VERSION}/blob-tree/`;
    const requestBody = {
      blob_tree: blobTree,
      bucket_name: "default-bucket",
      num_blob_bytes: fileData.length,
      owner: canisterId,
      project_id: projectId,
      headers: blobTree.headers,
      auth: {
        OwnerEgressSignature: Array.from(certificateBytes),
      },
    };

    const response = await fetchWithTimeout(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Caffeine-Project-ID": projectId,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to upload blob tree: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }
  });

  let completedChunks = 0;

  const uploadChunk = async (index: number) => {
    const chunkData = chunks[index]!;
    const blobRootHash = rootHash;
    const chunkHashStr = hashToShaString(chunkHashes[index]!);

    await withRetry(async () => {
      const queryParams = new URLSearchParams({
        owner_id: canisterId,
        blob_hash: blobRootHash,
        chunk_hash: chunkHashStr,
        chunk_index: index.toString(),
        bucket_name: "default-bucket",
        project_id: projectId,
      });
      const url = `${gatewayUrl}/${GATEWAY_VERSION}/chunk/?${queryParams.toString()}`;

      const response = await fetchWithTimeout(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Caffeine-Project-ID": projectId,
        },
        body: chunkData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to upload chunk ${index}: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }
    });

    completedChunks++;
    if (onProgress) {
      onProgress(
        chunks.length === 0
          ? 100
          : Math.round((completedChunks / chunks.length) * 100),
      );
    }
  };

  await Promise.all(
    Array.from({ length: MAX_CONCURRENT_UPLOADS }, async (_, workerId) => {
      for (let i = workerId; i < chunks.length; i += MAX_CONCURRENT_UPLOADS) {
        await uploadChunk(i);
      }
    }),
  );

  return rootHash;
}

export function getDownloadUrl(blobHash: string): string {
  const gatewayUrl = getGatewayUrl();
  const network = getNetwork();
  const { canisterId } = getEndpoint(network);
  const projectId = getProjectId();
  return (
    `${gatewayUrl}/${GATEWAY_VERSION}/blob/` +
    `?blob_hash=${encodeURIComponent(blobHash)}` +
    `&owner_id=${encodeURIComponent(canisterId)}` +
    `&project_id=${encodeURIComponent(projectId)}`
  );
}

export async function downloadBlob(blobHash: string): Promise<Uint8Array> {
  const url = getDownloadUrl(blobHash);
  const response = await withRetry(async () => {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      throw new Error(
        `Failed to download blob: ${res.status} ${res.statusText}`,
      );
    }
    return res;
  });
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

export function verifyBlobHash(data: Uint8Array, expectedHash: string): void {
  const { rootHash } = buildMerkleTree(data, "application/gzip");
  if (rootHash !== expectedHash) {
    throw new Error(
      `Blob integrity check failed: expected ${expectedHash} but got ${rootHash}`,
    );
  }
}

export {
  buildMerkleTree,
  splitChunks,
  chunkHash,
  nodeHash,
  metadataHash,
  hashToShaString,
};
