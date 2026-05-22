import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export type Chunk = Array<number>;
export type Err = string;
export type FileId = string;
export type FileId__1 = string;
export interface FileMeta {
  'id' : FileId__1,
  'owners' : Array<Principal>,
  'path' : string,
  'chunkCount' : bigint,
}
export type Result = { 'ok' : null } |
  { 'err' : Err };
export type Result_1 = { 'ok' : FileMeta } |
  { 'err' : Err };
export type Result_2 = { 'ok' : Chunk } |
  { 'err' : Err };
export interface Storage {
  'acceptCycles' : ActorMethod<[], undefined>,
  'deleteFile' : ActorMethod<[FileId], undefined>,
  'downloadChunk' : ActorMethod<[FileId, bigint], Result_2>,
  'finishUpload' : ActorMethod<[FileId], undefined>,
  'getFileIdsRange' : ActorMethod<[bigint, bigint], Array<FileId>>,
  'getFileMeta' : ActorMethod<[FileId], Result_1>,
  'getStats' : ActorMethod<[], StorageStats>,
  'startUpload' : ActorMethod<[FileMeta], Result>,
  'updateFileOwners' : ActorMethod<[FileId, Array<Principal>], undefined>,
  'uploadChunk' : ActorMethod<[FileId, bigint, Chunk], undefined>,
}
export interface StorageStats {
  'fileCount' : bigint,
  'cyclesBalance' : bigint,
  'memorySize' : bigint,
}
export interface _SERVICE extends Storage {}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];