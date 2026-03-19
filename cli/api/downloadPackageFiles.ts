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
): Promise<Map<string, Array<number>>> {
  version = await resolveVersion(pkg, version);

  let { storageId, fileIds } = await getPackageFilesInfo(pkg, version);
  let storage = await storageActor(storageId);

  let filesData = new Map<string, Array<number>>();
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

// download single file
export async function downloadFile(
  storage: Storage | string,
  fileId: string,
): Promise<{ path: string; data: Array<number> }> {
  if (typeof storage === "string") {
    storage = await storageActor(Principal.fromText(storage));
  }
  let fileMetaRes = await storage.getFileMeta(fileId);
  if ("err" in fileMetaRes) {
    throw fileMetaRes.err;
  }
  let fileMeta = fileMetaRes.ok;

  let data: Array<number> = [];
  for (let i = 0n; i < fileMeta.chunkCount; i++) {
    let chunkRes = await storage.downloadChunk(fileId, i);
    if ("err" in chunkRes) {
      throw chunkRes.err;
    }
    let chunk = chunkRes.ok;
    data = [...data, ...chunk];
  }

  return {
    path: fileMeta.path,
    data: data,
  };
}
