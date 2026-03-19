import Iter "mo:base/Iter";
import Text "mo:base/Text";
import Array "mo:base/Array";
import Buffer "mo:base/Buffer";
import TrieMap "mo:base/TrieMap";
import Cycles "mo:base/ExperimentalCycles";
import Result "mo:base/Result";
import Principal "mo:base/Principal";
import Debug "mo:base/Debug";
import { ic } "mo:ic";

import Types "./types";
import Storage "./storage-canister";

module {
  public type StorageId = Principal;
  public type StorageStats = Types.StorageStats;
  public type FileMeta = Types.FileMeta;
  public type FileId = Types.FileId;
  public type Chunk = Types.Chunk;
  public type Err = Types.Err;

  public type Stable = ?{
    storages : [(StorageId, StorageStats)];
    storageByFileId : [(FileId, StorageId)];
  };

  public class StorageManager() {
    var storages : TrieMap.TrieMap<StorageId, StorageStats> = TrieMap.TrieMap(Principal.equal, Principal.hash);
    var storageByFileId : TrieMap.TrieMap<FileId, StorageId> = TrieMap.TrieMap(Text.equal, Text.hash);

    let MIN_UPLOADABLE_STORAGES = 1;
    let OWN_MIN_CYCLES = 5_000_000_000_000; // 5TC
    let STORAGE_INITIAL_CYCLES = 5_000_000_000_000; // 5TC
    let STORAGE_MIN_CYCLES = 2_000_000_000_000; // 2TC
    let STORAGE_TOP_UP_CYCLES = 3_000_000_000_000; // 3TC

    let MAX_STORAGE_SIZE = 1024 ** 3 * 2; // 2Gb;
    // let MIN_CHUNK_SIZE = 1024 * 512 / 8; // 512Kb
    // let MAX_CHUNK_SIZE = 1024 * 1024 / 8; // 1Mb
    // let MAX_FILE_SIZE = 1024 * 1024 * 10; // 10Mb

    func _spawnStorage() : async () {
      assert (Cycles.balance() > OWN_MIN_CYCLES + STORAGE_INITIAL_CYCLES);
      let storage = await (with cycles = STORAGE_INITIAL_CYCLES) Storage.Storage();
      let stats = await storage.getStats();
      let storageId = Principal.fromActor(storage);
      storages.put(storageId, stats);
    };

    func _getUploadableStorages() : [StorageId] {
      var uploadableStorages = Buffer.Buffer<Principal>(0);

      for ((principal, stats) in storages.entries()) {
        if (stats.memorySize < MAX_STORAGE_SIZE) {
          uploadableStorages.add(principal);
        };
      };

      Buffer.toArray(uploadableStorages);
    };

    func _updateStorageStats() : async () {
      for ((principal, stats) in storages.entries()) {
        let storage = actor (Principal.toText(principal)) : Storage.Storage;
        let stats = await storage.getStats();
        storages.put(principal, stats);
      };
    };

    public func topUpStorages() : async () {
      for (principal in storages.keys()) {
        let storage = actor (Principal.toText(principal)) : Storage.Storage;
        let stats = await storage.getStats();
        let mustTopUp = stats.cyclesBalance < STORAGE_MIN_CYCLES;
        let canTopUp = Cycles.balance() > OWN_MIN_CYCLES + STORAGE_TOP_UP_CYCLES;

        if (mustTopUp and canTopUp) {
          await (with cycles = STORAGE_TOP_UP_CYCLES) storage.acceptCycles();
        };
      };
    };

    public func ensureUploadableStorages() : async () {
      var uploadableStorageCount = _getUploadableStorages().size();

      while (uploadableStorageCount < MIN_UPLOADABLE_STORAGES) {
        await _spawnStorage();
        uploadableStorageCount += 1;
      };
    };

    public func setControllers(controllers : [Principal]) : async () {
      for (storageId in storages.keys()) {
        await ic.update_settings({
          canister_id = storageId;
          sender_canister_version = null;
          settings = {
            controllers = ?controllers;
            compute_allocation = null;
            freezing_threshold = null;
            memory_allocation = null;
            reserved_cycles_limit = null;
            log_visibility = null;
            wasm_memory_limit = null;
            wasm_memory_threshold = null;
          };
        });
      };
    };

    // UPLOAD
    public func startUpload(storageId : Principal, fileMeta : FileMeta) : async Result.Result<(), Err> {
      let storage = actor (Principal.toText(storageId)) : Storage.Storage;
      await storage.startUpload(fileMeta);
    };

    public func uploadChunk(storageId : Principal, fileId : FileId, chunkIndex : Nat, chunk : Chunk) : async Result.Result<(), Err> {
      let storage = actor (Principal.toText(storageId)) : Storage.Storage;
      await storage.uploadChunk(fileId, chunkIndex, chunk);
    };

    var counter = 0;
    public func finishUploads(storageId : Principal, fileIds : [FileId]) : async Result.Result<(), Err> {
      let storage = actor (Principal.toText(storageId)) : Storage.Storage;

      let res = await storage.finishUploads(fileIds);
      if (Result.isErr(res)) {
        return res;
      };

      for (fileId in fileIds.vals()) {
        storageByFileId.put(fileId, storageId);
      };

      if (counter % 50 == 0) {
        await _updateStorageStats();
        await ensureUploadableStorages();
      };
      counter += 1;

      #ok;
    };

    // QUERY
    public func getAllStorages() : [StorageId] {
      Iter.toArray(storages.keys());
    };

    public func getStoragesStats() : [(StorageId, StorageStats)] {
      Iter.toArray(storages.entries());
    };

    public func getStorageForUpload() : StorageId {
      _getUploadableStorages()[0];
    };

    public func getStorageOfFile(fileId : FileId) : StorageId {
      let ?storageId = storageByFileId.get(fileId) else Debug.trap("Storage canister not found for file id '" # fileId # "'");
      storageId;
    };

    public func getStoragesForDownload(fileIds : [FileId]) : [StorageId] {
      assert (fileIds.size() < 1000);

      Array.map<FileId, Principal>(
        fileIds,
        func(fileId) {
          let ?storageId = storageByFileId.get(fileId) else Debug.trap("Storage canister not found for file id '" # fileId # "'");
          storageId;
        },
      );
    };

    public func toStable() : Stable {
      return ?{
        storages = Iter.toArray(storages.entries());
        storageByFileId = Iter.toArray(storageByFileId.entries());
      };
    };

    public func loadStable(stab : Stable) {
      switch (stab) {
        case (null) {};
        case (?data) {
          storages := TrieMap.fromEntries<StorageId, StorageStats>(data.storages.vals(), Principal.equal, Principal.hash);
          storageByFileId := TrieMap.fromEntries<FileId, StorageId>(data.storageByFileId.vals(), Text.equal, Text.hash);
        };
      };
    };
  };
};
