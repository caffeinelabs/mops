import Time "mo:base/Time";
import TrieMap "mo:base/TrieMap";
import Buffer "mo:base/Buffer";
import Result "mo:base/Result";
import Text "mo:base/Text";
import Principal "mo:base/Principal";
import Char "mo:base/Char";
import Array "mo:base/Array";
import Option "mo:base/Option";
import Iter "mo:base/Iter";
import Sha256 "mo:sha2/Sha256";

import Registry "./registry/Registry";
import StorageManager "../storage/storage-manager";

import Types "./types";
import { generateId } "../generate-id";
import { validateConfig } "./utils/validateConfig";
import PackageUtils "./utils/package-utils";

module {
  type PackageVersion = Types.PackageVersion;
  type PackageConfigV3 = Types.PackageConfigV3;
  type DependencyV2 = Types.DependencyV2;
  type PackageFileStats = Types.PackageFileStats;
  type TestStats = Types.TestStats;
  type FileId = Types.FileId;
  type Benchmarks = Types.Benchmarks;
  type PackagePublication = Types.PackagePublication;

  type PublishingId = Text;
  type PublishingErr = Text;
  type PublishingPackage = {
    time : Time.Time;
    user : Principal;
    config : PackageConfigV3;
    storage : Principal;
  };
  type PublishingFile = {
    id : FileId;
    path : Text;
  };

  public class PackagePublisher(registry : Registry.Registry, storageManager : StorageManager.StorageManager) {
    let MAX_PACKAGE_FILES = 300;
    let MAX_PACKAGE_SIZE = 1024 * 1024 * 28; // 28MB

    let publishingPackages = TrieMap.TrieMap<PublishingId, PublishingPackage>(Text.equal, Text.hash);
    let publishingFiles = TrieMap.TrieMap<PublishingId, Buffer.Buffer<PublishingFile>>(Text.equal, Text.hash);
    let publishingPackageFileStats = TrieMap.TrieMap<PublishingId, PackageFileStats>(Text.equal, Text.hash);
    let publishingTestStats = TrieMap.TrieMap<PublishingId, TestStats>(Text.equal, Text.hash);
    let publishingNotes = TrieMap.TrieMap<PublishingId, Text>(Text.equal, Text.hash);
    let publishingFileHashers = TrieMap.TrieMap<FileId, Sha256.Digest>(Text.equal, Text.hash);
    let publishingBenchmarks = TrieMap.TrieMap<PublishingId, Benchmarks>(Text.equal, Text.hash);
    let publishingDocsCoverage = TrieMap.TrieMap<PublishingId, Float>(Text.equal, Text.hash);

    public func startPublish(caller : Principal, config : PackageConfigV3) : async Result.Result<PublishingId, PublishingErr> {
      if (Principal.isAnonymous(caller)) {
        return #err("Unauthorized");
      };

      // validate config
      switch (validateConfig(config)) {
        case (#ok) {};
        case (#err(err)) {
          return #err(err);
        };
      };

      let isNewPackage = registry.getHighestVersion(config.name) == null;

      // check permissions
      if (not isNewPackage and not registry.isOwner(config.name, caller) and not registry.isMaintainer(config.name, caller)) {
        return #err("Only owners and maintainers can publish packages");
      };

      // deny '.' and '_' in name for new packages
      if (isNewPackage) {
        for (char in config.name.chars()) {
          let err = #err("invalid config: unexpected char '" # Char.toText(char) # "' in name '" # config.name # "'");
          if (char == '.' or char == '_') {
            return err;
          };
        };
      };

      // check if the same version is published
      switch (registry.getPackageVersions(config.name)) {
        case (?versions) {
          let sameVersionOpt = Array.find<PackageVersion>(
            versions,
            func(ver : PackageVersion) {
              ver == config.version;
            },
          );
          if (sameVersionOpt != null) {
            return #err(config.name # "@" # config.version # " already published\nPlease increment the package version in the mops.toml file.");
          };
        };
        case (null) {};
      };

      // check dependencies
      for (dep in config.dependencies.vals()) {
        let packageId = PackageUtils.getPackageId(dep.name, dep.version);
        if (dep.repo.size() == 0 and registry.getPackageConfig(PackageUtils.getDepName(dep.name), dep.version) == null) {
          return #err("Dependency " # packageId # " not found in registry");
        };
        if (dep.repo.size() != 0) {
          return #err("GitHub dependencies are no longer supported to improve registry reliability and dependency resolution.");
        };
      };

      // check devDependencies
      for (dep in config.devDependencies.vals()) {
        let packageId = PackageUtils.getPackageId(dep.name, dep.version);
        if (dep.repo.size() == 0 and registry.getPackageConfig(PackageUtils.getDepName(dep.name), dep.version) == null) {
          return #err("Dev Dependency " # packageId # " not found in registry");
        };
      };

      let publishingId = await generateId();

      if (publishingPackages.get(publishingId) != null) {
        return #err("Already publishing");
      };

      await storageManager.ensureUploadableStorages();

      // start
      publishingPackages.put(
        publishingId,
        {
          time = Time.now();
          user = caller;
          config = config;
          storage = storageManager.getStorageForUpload();
        },
      );
      publishingFiles.put(publishingId, Buffer.Buffer(10));

      publishingPackageFileStats.put(publishingId, PackageUtils.defaultPackageFileStats());

      #ok(publishingId);
    };

    public func startFileUpload(caller : Principal, publishingId : PublishingId, path : Text, chunkCount : Nat, firstChunk : Blob) : async Result.Result<FileId, PublishingErr> {
      assert (not Principal.isAnonymous(caller));

      let ?publishing = publishingPackages.get(publishingId) else return #err("Publishing package not found");
      assert (publishing.user == caller);

      let ?pubFiles = publishingFiles.get(publishingId) else return #err("Publishing files not found");
      if (pubFiles.size() >= MAX_PACKAGE_FILES) {
        return #err("Maximum number of package files: 300");
      };

      let moMd = Text.endsWith(path, #text(".mo")) or Text.endsWith(path, #text(".md"));
      let didToml = Text.endsWith(path, #text(".did")) or Text.endsWith(path, #text(".toml"));
      let license = Text.endsWith(path, #text("LICENSE")) or Text.endsWith(path, #text("LICENSE.md")) or Text.endsWith(path, #text("license"));
      let notice = Text.endsWith(path, #text("NOTICE")) or Text.endsWith(path, #text("NOTICE.md")) or Text.endsWith(path, #text("notice"));
      let docsTgz = path == "docs.tgz";
      if (not (moMd or didToml or license or notice or docsTgz)) {
        return #err("File " # path # " has unsupported extension. Allowed: .mo, .md, .did, .toml");
      };

      let fileId = publishing.config.name # "@" # publishing.config.version # "/" # path;

      let startRes = await storageManager.startUpload(
        publishing.storage,
        {
          id = fileId;
          path = path;
          chunkCount = chunkCount;
          owners = [];
        },
      );
      switch (startRes) {
        case (#err(err)) {
          return #err(err);
        };
        case (_) {};
      };

      // add temp hasher
      let hasher = Sha256.Digest(#sha256);
      publishingFileHashers.put(fileId, hasher);

      // upload first chunk
      if (chunkCount != 0) {
        let uploadRes = await storageManager.uploadChunk(publishing.storage, fileId, 0, firstChunk);
        switch (uploadRes) {
          case (#err(err)) {
            return #err(err);
          };
          case (_) {};
        };

        // compute hash of the first chunk
        hasher.writeBlob(firstChunk);
      };

      // file stats
      switch (publishingPackageFileStats.get(publishingId)) {
        case (?fileStats) {
          if (docsTgz) {
            publishingPackageFileStats.put(
              publishingId,
              {
                fileStats with
                docsCount = 1;
                docsSize = firstChunk.size();
              },
            );
          } else {
            publishingPackageFileStats.put(
              publishingId,
              {
                fileStats with
                sourceFiles = fileStats.sourceFiles + 1;
                sourceSize = fileStats.sourceSize + firstChunk.size();
              },
            );
          };
        };
        case (null) {
          return #err("File stats not found");
        };
      };

      switch (_checkPublishingPackageSize(publishingId)) {
        case (#err(err)) {
          return #err(err);
        };
        case (#ok) {};
      };

      let pubFile : PublishingFile = {
        id = fileId;
        path = path;
      };
      pubFiles.add(pubFile);

      #ok(fileId);
    };

    public func uploadFileChunk(caller : Principal, publishingId : PublishingId, fileId : FileId, chunkIndex : Nat, chunk : Blob) : async Result.Result<(), PublishingErr> {
      assert (not Principal.isAnonymous(caller));

      let ?publishing = publishingPackages.get(publishingId) else return #err("Publishing package not found");
      assert (publishing.user == caller);

      let uploadRes = await storageManager.uploadChunk(publishing.storage, fileId, chunkIndex, chunk);
      let #ok = uploadRes else return uploadRes;

      // file stats
      switch (publishingPackageFileStats.get(publishingId)) {
        case (?fileStats) {
          publishingPackageFileStats.put(
            publishingId,
            {
              fileStats with
              sourceFiles = fileStats.sourceFiles + 1;
              sourceSize = fileStats.sourceSize + chunk.size();
            },
          );
        };
        case (null) {
          return #err("File stats not found");
        };
      };

      let pkgSizeRes = _checkPublishingPackageSize(publishingId);
      if (Result.isErr(pkgSizeRes)) {
        return pkgSizeRes;
      };

      let ?hasher = publishingFileHashers.get(fileId) else return #err("Hasher not found");
      hasher.writeBlob(chunk);

      #ok;
    };

    public func uploadTestStats(caller : Principal, publishingId : PublishingId, testStats : TestStats) : Result.Result<(), PublishingErr> {
      assert (not Principal.isAnonymous(caller));

      if (testStats.passedNames.size() > 10_000) {
        return #err("Max number of test names is 10_000");
      };

      let ?publishing = publishingPackages.get(publishingId) else return #err("Publishing package not found");
      assert (publishing.user == caller);

      publishingTestStats.put(publishingId, testStats);
      #ok;
    };

    public func uploadNotes(caller : Principal, publishingId : PublishingId, notes : Text) : Result.Result<(), PublishingErr> {
      assert (not Principal.isAnonymous(caller));

      if (notes.size() > 10_000) {
        return #err("Max changelog size is 10_000");
      };

      let ?publishing = publishingPackages.get(publishingId) else return #err("Publishing package not found");
      assert (publishing.user == caller);

      publishingNotes.put(publishingId, notes);
      #ok;
    };

    public func uploadBenchmarks(caller : Principal, publishingId : PublishingId, benchmarks : Benchmarks) : Result.Result<(), PublishingErr> {
      assert (not Principal.isAnonymous(caller));

      if (benchmarks.size() > 100) {
        return #err("Max number of benchmarks is 100");
      };

      for (benchmark in benchmarks.vals()) {
        if (benchmark.file.size() > 100) {
          return #err("Benchmark filename max length is 100");
        };
        if (benchmark.name.size() > 100) {
          return #err("Benchmark name max length is 100");
        };
        if (benchmark.description.size() > 1000) {
          return #err("Benchmark description max length is 1000");
        };
        if (benchmark.compiler != "moc") {
          return #err("Benchmark compiler must be 'moc'");
        };
        if (benchmark.compilerVersion.size() > 12) {
          return #err("Benchmark compiler version max length is 12");
        };
        if (benchmark.replica != "dfx" and benchmark.replica != "pocket-ic") {
          return #err("Benchmark replica must be one of 'dfx', 'pocket-ic'");
        };
        if (benchmark.replicaVersion.size() > 12) {
          return #err("Benchmark replica version max length is 12");
        };
        if (benchmark.gc != "copying" and benchmark.gc != "compacting" and benchmark.gc != "generational" and benchmark.gc != "incremental") {
          return #err("Benchmark GC must be one of 'copying', 'compacting', 'generational', 'incremental'");
        };
        if (benchmark.rows.size() > 50) {
          return #err("Max number of benchmark rows is 50");
        };
        if (benchmark.cols.size() > 50) {
          return #err("Max number of benchmark cols is 50");
        };
        for (row in benchmark.rows.vals()) {
          if (row.size() > 64) {
            return #err("Benchmark row max length is 64");
          };
        };
        for (col in benchmark.cols.vals()) {
          if (col.size() > 64) {
            return #err("Benchmark col max length is 64");
          };
        };
        for ((metric, cells) in benchmark.metrics.vals()) {
          if (metric != "instructions" and metric != "rts_heap_size" and metric != "rts_logical_stable_memory_size" and metric != "rts_reclaimed") {
            return #err("Benchmark metric must be one of 'instructions', 'rts_heap_size', 'rts_logical_stable_memory_size', 'rts_reclaimed'");
          };
          if (cells.size() != benchmark.rows.size()) {
            return #err("Benchmark metrics and table schema row count mismatch");
          };
          for (rowOfCols in cells.vals()) {
            if (rowOfCols.size() != benchmark.cols.size()) {
              return #err("Benchmark metrics and table schema column count mismatch");
            };
            for (value in rowOfCols.vals()) {
              if (value < -1_000_000_000_000_000_000) {
                return #err("Min benchmark metric value is -1_000_000_000_000_000_000");
              };
              if (value > 1_000_000_000_000_000_000) {
                return #err("Max benchmark metric value is 1_000_000_000_000_000_000");
              };
            };
          };
        };
      };

      let ?publishing = publishingPackages.get(publishingId) else return #err("Publishing package not found");
      assert (publishing.user == caller);

      publishingBenchmarks.put(publishingId, benchmarks);
      #ok;
    };

    public func uploadDocsCoverage(caller : Principal, publishingId : PublishingId, docsCoverage : Float) : Result.Result<(), PublishingErr> {
      assert (not Principal.isAnonymous(caller));

      if (docsCoverage < 0 or docsCoverage > 100) {
        return #err("Docs coverage must be between 0 and 100");
      };

      let ?publishing = publishingPackages.get(publishingId) else return #err("Publishing package not found");
      assert (publishing.user == caller);

      publishingDocsCoverage.put(publishingId, docsCoverage);
      #ok;
    };

    public func finishPublish(caller : Principal, publishingId : PublishingId) : async Result.Result<{ config : PackageConfigV3; publication : PackagePublication; isNewPackage : Bool }, PublishingErr> {
      assert (not Principal.isAnonymous(caller));

      let ?publishing = publishingPackages.get(publishingId) else return #err("Publishing package not found");
      assert (publishing.user == caller);

      let ?pubFiles = publishingFiles.get(publishingId) else return #err("Publishing files not found");

      var mopsToml = false;
      var readmeMd = false;

      for (file in pubFiles.vals()) {
        if (file.path == "mops.toml") {
          mopsToml := true;
        };
        if (file.path == "README.md") {
          readmeMd := true;
        };
      };

      if (not mopsToml) {
        return #err("Missing required file mops.toml");
      };
      if (not readmeMd) {
        return #err("Missing required file README.md");
      };

      let pkgSizeRes = _checkPublishingPackageSize(publishingId);
      switch (pkgSizeRes) {
        case (#err(err)) {
          return #err(err);
        };
        case (#ok) {};
      };

      let fileIds = Array.map(
        Buffer.toArray(pubFiles),
        func(file : PublishingFile) : Text {
          file.id;
        },
      );

      let publicFileIds = Array.filter(
        fileIds,
        func(fileId : Text) : Bool {
          not Text.endsWith(fileId, #text("docs.tgz"));
        },
      );

      // file hashes
      let fileHashes = TrieMap.TrieMap<FileId, Blob>(Text.equal, Text.hash);
      for (fileId in publicFileIds.vals()) {
        let ?hasher = publishingFileHashers.get(fileId) else return #err("Hasher not found");
        fileHashes.put(fileId, hasher.sum());
        publishingFileHashers.delete(fileId);
      };

      // finish uploads
      let res = await storageManager.finishUploads(publishing.storage, fileIds);
      switch (res) {
        case (#err(err)) {
          return #err(err);
        };
        case (_) {};
      };

      let isNewPackage = registry.getHighestVersion(publishing.config.name) == null;

      let publication = registry.newPackageRelease({
        userId = caller;
        config = publishing.config;
        notes = Option.get(publishingNotes.get(publishingId), "");
        benchmarks = Option.get(publishingBenchmarks.get(publishingId), []);
        storageId = publishing.storage;
        fileIds = publicFileIds;
        fileHashes = Iter.toArray(fileHashes.entries());
        fileStats = publishingPackageFileStats.get(publishingId);
        testStats = publishingTestStats.get(publishingId);
        docsCoverage = Option.get(publishingDocsCoverage.get(publishingId), 0.0);
      });

      publishingFiles.delete(publishingId);
      publishingPackages.delete(publishingId);
      publishingPackageFileStats.delete(publishingId);
      publishingTestStats.delete(publishingId);
      publishingNotes.delete(publishingId);
      publishingBenchmarks.delete(publishingId);
      publishingDocsCoverage.delete(publishingId);

      #ok({
        config = publishing.config;
        publication;
        isNewPackage;
      });
    };

    func _checkPublishingPackageSize(publishingId : PublishingId) : Result.Result<(), PublishingErr> {
      switch (publishingPackageFileStats.get(publishingId)) {
        case (?fileStats) {
          if (fileStats.sourceSize + fileStats.docsSize > MAX_PACKAGE_SIZE) {
            return #err("Max package size is 28MB");
          };
          #ok;
        };
        case (null) {
          #err("File stats not found");
        };
      };
    };
  };
};
