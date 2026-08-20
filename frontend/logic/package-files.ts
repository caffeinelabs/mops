import type { Principal } from "@icp-sdk/core/principal";

import { mainActor, storageActor } from "/logic/actors";

export async function getFileIds(
  pkg: string,
  version: string,
): Promise<string[]> {
  const res = await mainActor().getFileIds(pkg, version);
  if ("err" in res) {
    throw new Error(res.err);
  }
  return res.ok;
}

export async function downloadFile(
  storageId: string | Principal,
  fileId: string,
): Promise<Uint8Array> {
  const storage = storageActor(storageId);

  const metaRes = await storage.getFileMeta(fileId);
  if ("err" in metaRes) {
    throw new Error(metaRes.err);
  }

  const chunks: Array<number>[] = [];
  let size = 0;
  for (let i = 0n; i < metaRes.ok.chunkCount; i++) {
    const chunkRes = await storage.downloadChunk(fileId, i);
    if ("err" in chunkRes) {
      throw new Error(chunkRes.err);
    }
    chunks.push(chunkRes.ok);
    size += chunkRes.ok.length;
  }

  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return data;
}
