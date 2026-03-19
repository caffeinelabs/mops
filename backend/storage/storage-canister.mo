import { rts_memory_size } "mo:prim";
import Cycles "mo:base/ExperimentalCycles";
import Option "mo:base/Option";
import Result "mo:base/Result";
import Array "mo:base/Array";
import Buffer "mo:base/Buffer";
import TrieMap "mo:base/TrieMap";
import Iter "mo:base/Iter";
import Text "mo:base/Text";
import Blob "mo:base/Blob";
import Nat "mo:base/Nat";

import Types "./types";

shared ({ caller = parent }) persistent actor class Storage() {
  public type StorageStats = Types.StorageStats;
  public type FileMeta = Types.FileMeta;
  public type FileId = Types.FileId;
  public type Chunk = Types.Chunk;
  public type Err = Types.Err;

  transient var filesMeta = TrieMap.TrieMap<FileId, FileMeta>(Text.equal, Text.hash);
  transient var filesChunks = TrieMap.TrieMap<FileId, [Chunk]>(Text.equal, Text.hash);

  func _getStats() : StorageStats {
    return {
      fileCount = filesMeta.size();
      memorySize = rts_memory_size();
      cyclesBalance = Cycles.balance();
      // activeUploadsMeta = activeUploadsMeta.size();
      // activeUploadsChunks = activeUploadsChunks.size();
    };
  };

  public query func getStats() : async StorageStats {
    _getStats();
  };

  public func acceptCycles() : async () {
    ignore Cycles.accept<system>(Cycles.available());
  };

  public shared query ({ caller }) func getFileIdsRange(start : Nat, end : Nat) : async [FileId] {
    assert (caller == parent);

    let buffer = Buffer.Buffer<FileId>(end - start);
    let fileIds = Iter.toArray(filesMeta.keys());

    for (i in Iter.range(start, end - 1)) {
      buffer.add(fileIds[i]);
    };

    Buffer.toArray(buffer);
  };

  // UPLOAD
  transient let activeUploadsMeta = TrieMap.TrieMap<FileId, FileMeta>(Text.equal, Text.hash);
  transient let activeUploadsChunks = TrieMap.TrieMap<FileId, [var Chunk]>(Text.equal, Text.hash);

  public shared ({ caller }) func startUpload(fileMeta : FileMeta) : async Result.Result<(), Err> {
    assert (caller == parent);

    if (filesMeta.get(fileMeta.id) != null) {
      return #err("File '" # fileMeta.id # "' already exists");
    };

    activeUploadsMeta.put(fileMeta.id, fileMeta);
    activeUploadsChunks.put(fileMeta.id, Array.init<Chunk>(fileMeta.chunkCount, Blob.fromArray([])));

    #ok;
  };

  public shared ({ caller }) func uploadChunk(fileId : FileId, chunkIndex : Nat, chunk : Chunk) : async Result.Result<(), Err> {
    assert (caller == parent);

    switch (activeUploadsChunks.get(fileId)) {
      case (null) {
        #err("File '" # fileId # "' is not uploading");
      };
      case (?chunks) {
        if (chunkIndex < 0 or chunkIndex >= chunks.size()) {
          return #err("Invalid chunk index '" # Nat.toText(chunkIndex) # "' for file '" # fileId # "'");
        };
        chunks[chunkIndex] := chunk;
        #ok;
      };
    };
  };

  public shared ({ caller }) func finishUploads(fileIds : [FileId]) : async Result.Result<(), Err> {
    assert (caller == parent);

    for (fileId in fileIds.vals()) {
      if (Option.isNull(activeUploadsMeta.get(fileId))) {
        return #err("File '" # fileId # "' is not uploading");
      };
      if (Option.isNull(activeUploadsChunks.get(fileId))) {
        return #err("File '" # fileId # "' is not uploading");
      };
    };

    for (fileId in fileIds.vals()) {
      let ?fileMeta = activeUploadsMeta.get(fileId) else return #err("File '" # fileId # "' is not uploading");
      let ?chunks = activeUploadsChunks.get(fileId) else return #err("File '" # fileId # "' is not uploading");

      filesMeta.put(fileId, fileMeta);
      filesChunks.put(fileId, Array.freeze<Chunk>(chunks));

      activeUploadsMeta.delete(fileId);
      activeUploadsChunks.delete(fileId);
    };

    #ok;
  };

  // update file owners
  public shared ({ caller }) func updateFileOwners(fileId : FileId, owners : [Principal]) : async Result.Result<(), Err> {
    assert (caller == parent);

    switch (filesMeta.get(fileId)) {
      case (null) {
        #err("File '" # fileId # "' not found");
      };
      case (?fileMeta) {
        filesMeta.put(
          fileId,
          {
            id = fileMeta.id;
            path = fileMeta.path;
            chunkCount = fileMeta.chunkCount;
            owners = owners;
          },
        );
        #ok;
      };
    };
  };

  // delete file
  public shared ({ caller }) func deleteFile(fileId : FileId) : async () {
    assert (caller == parent);

    filesMeta.delete(fileId);
    filesChunks.delete(fileId);
  };

  public shared ({ caller }) func clearActiveUploads() : async () {
    assert (caller == parent);

    for (fileId in activeUploadsMeta.keys()) {
      activeUploadsMeta.delete(fileId);
    };
    for (fileId in activeUploadsChunks.keys()) {
      activeUploadsChunks.delete(fileId);
    };
  };

  // DOWNLOAD
  func _getFileMeta(fileId : FileId, caller : Principal) : Result.Result<FileMeta, Err> {
    switch (filesMeta.get(fileId)) {
      case (null) {
        #err("File '" # fileId # "' not found");
      };
      case (?fileMeta) {
        if (fileMeta.owners.size() > 0) {
          let found = Array.find<Principal>(fileMeta.owners, func(owner) = owner == caller);
          if (found == null) {
            return #err("You have no permissions to access file " # fileId);
          };
        };
        #ok(fileMeta);
      };
    };
  };

  public shared query ({ caller }) func getFileMeta(fileId : FileId) : async Result.Result<FileMeta, Err> {
    assert (fileId.size() < 1000);
    _getFileMeta(fileId, caller);
  };

  public shared query ({ caller }) func downloadChunk(fileId : FileId, chunkIndex : Nat) : async Result.Result<Chunk, Err> {
    assert (fileId.size() < 1000);

    // check access
    switch (_getFileMeta(fileId, caller)) {
      case (#err(err)) {
        return #err(err);
      };
      case (#ok(_)) {};
    };

    let ?chunks = filesChunks.get(fileId) else return #err("File '" # fileId # "' not found");
    if (chunkIndex < 0 or chunkIndex >= chunks.size()) {
      return #err("Invalid chunk index '" # Nat.toText(chunkIndex) # "' for file '" # fileId # "'");
    };
    #ok(chunks[chunkIndex]);
  };

  // SYSTEM
  var filesMetaStable : [(FileId, FileMeta)] = [];
  var filesChunksStable : [(FileId, [Chunk])] = [];

  system func preupgrade() {
    filesMetaStable := Iter.toArray(filesMeta.entries());
    filesChunksStable := Iter.toArray(filesChunks.entries());
  };

  system func postupgrade() {
    filesMeta := TrieMap.fromEntries<FileId, FileMeta>(filesMetaStable.vals(), Text.equal, Text.hash);
    filesMetaStable := [];

    filesChunks := TrieMap.fromEntries<FileId, [Chunk]>(filesChunksStable.vals(), Text.equal, Text.hash);
    filesChunksStable := [];
  };
};
