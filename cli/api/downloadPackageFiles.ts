import { Principal } from "@icp-sdk/core/principal";
import { mainActor, storageActor } from "./actors.js";
import { resolveVersion } from "./resolveVersion.js";
import { parallel } from "../parallel.js";
import { Storage } from "../declarations/storage/storage.did.js";

export async function downloadPackageFiles(
  pkg: string,
  version = "",
  threads = 8,
  onLoad = (_fileIds: string[], _fileId: string) => {},
): Promise<Map<string, Uint8Array>> {
  version = await resolveVersion(pkg, version);

  let { storageId, fileIds } = await getPackageFilesInfo(pkg, version);
  let storage = await storageActor(storageId);

  let filesData = new Map<string, Uint8Array>();
  await parallel(threads, fileIds, async (fileId: string) => {
    let { path, data } = await downloadFile(storage, fileId);
    filesData.set(path, data);
    onLoad(fileIds, fileId);
  });

  return filesData;
}

// get package files meta
export async function getPackageFilesInfo(
  pkg: string,
  version: string,
): Promise<{ storageId: Principal; fileIds: string[] }> {
  let actor = await mainActor();

  let [packageDetailsRes, fileIds] = await Promise.all([
    actor.getPackageDetails(pkg, version),
    getFileIds(pkg, version),
  ]);

  if ("err" in packageDetailsRes) {
    throw packageDetailsRes.err;
  }
  let packageDetails = packageDetailsRes.ok;

  return {
    storageId: packageDetails.publication.storage,
    fileIds,
  };
}

// get package files ids
export async function getFileIds(
  pkg: string,
  version: string,
): Promise<string[]> {
  let actor = await mainActor();
  let fileIdsRes = await actor.getFileIds(pkg, version);

  if ("err" in fileIdsRes) {
    throw fileIdsRes.err;
  }
  let filesIds = fileIdsRes.ok;

  return filesIds;
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 1) {
    return chunks[0] as Uint8Array;
  }
  let size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  let data = new Uint8Array(size);
  let offset = 0;
  for (let chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return data;
}

// download single file
export async function downloadFile(
  storage: Storage | string,
  fileId: string,
): Promise<{ path: string; data: Uint8Array }> {
  if (typeof storage === "string") {
    storage = await storageActor(Principal.fromText(storage));
  }

  // Chunks are 1.5mb (see `publish.ts`), so virtually every published file is a
  // single chunk. Speculating on chunk 0 alongside the meta halves the query
  // round trips per file. `allSettled` so a failure on one leg cannot surface
  // as an unhandled rejection on the other.
  let [metaSettled, firstChunkSettled] = await Promise.allSettled([
    storage.getFileMeta(fileId),
    storage.downloadChunk(fileId, 0n),
  ]);

  if (metaSettled.status === "rejected") {
    throw metaSettled.reason;
  }
  let fileMetaRes = metaSettled.value;
  if ("err" in fileMetaRes) {
    throw fileMetaRes.err;
  }
  let fileMeta = fileMetaRes.ok;

  // An empty file is published with no chunks at all, so chunk 0 legitimately
  // does not exist and its error must be ignored.
  if (fileMeta.chunkCount === 0n) {
    return { path: fileMeta.path, data: new Uint8Array() };
  }

  if (firstChunkSettled.status === "rejected") {
    throw firstChunkSettled.reason;
  }
  let firstChunkRes = firstChunkSettled.value;
  if ("err" in firstChunkRes) {
    throw firstChunkRes.err;
  }

  let chunks = [Uint8Array.from(firstChunkRes.ok)];
  for (let i = 1n; i < fileMeta.chunkCount; i++) {
    let chunkRes = await storage.downloadChunk(fileId, i);
    if ("err" in chunkRes) {
      throw chunkRes.err;
    }
    chunks.push(Uint8Array.from(chunkRes.ok));
  }

  return {
    path: fileMeta.path,
    data: concatChunks(chunks),
  };
}
