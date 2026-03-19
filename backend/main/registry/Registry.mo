import TrieMap "mo:base/TrieMap";
import Iter "mo:base/Iter";
import Option "mo:base/Option";
import Array "mo:base/Array";
import Time "mo:base/Time";
import Result "mo:base/Result";
import Principal "mo:base/Principal";

import Types "../types";
import Semver "../utils/semver";
import PackageUtils "../utils/package-utils";

module {
  public type PackageName = Types.PackageName;
  public type PackageVersion = Types.PackageVersion;
  public type PackageId = Types.PackageId;
  public type FileId = Types.FileId;
  public type PackageConfigV3 = Types.PackageConfigV3;
  public type PackagePublication = Types.PackagePublication;
  public type PackageFileStats = Types.PackageFileStats;
  public type TestStats = Types.TestStats;
  public type Benchmarks = Types.Benchmarks;

  type NewPackageReleaseArgs = {
    userId : Principal;
    config : PackageConfigV3;
    notes : Text;
    storageId : Principal;
    fileIds : [FileId];
    fileHashes : [(FileId, Blob)];
    fileStats : ?PackageFileStats;
    testStats : ?TestStats;
    benchmarks : Benchmarks;
    docsCoverage : Float;
  };

  public class Registry(
    packageVersions : TrieMap.TrieMap<PackageName, [PackageVersion]>,
    ownersByPackage : TrieMap.TrieMap<PackageName, [Principal]>,
    maintainersByPackage : TrieMap.TrieMap<PackageName, [Principal]>,
    highestConfigs : TrieMap.TrieMap<PackageName, PackageConfigV3>,
    packageConfigs : TrieMap.TrieMap<PackageId, PackageConfigV3>,
    packagePublications : TrieMap.TrieMap<PackageId, PackagePublication>,
    fileIdsByPackage : TrieMap.TrieMap<PackageId, [FileId]>,
    hashByFileId : TrieMap.TrieMap<FileId, Blob>,
    packageFileStats : TrieMap.TrieMap<PackageId, PackageFileStats>,
    packageTestStats : TrieMap.TrieMap<PackageId, TestStats>,
    packageBenchmarks : TrieMap.TrieMap<PackageId, Benchmarks>,
    packageNotes : TrieMap.TrieMap<PackageId, Text>,
    packageDocsCoverage : TrieMap.TrieMap<PackageId, Float>,
  ) {

    // -----------------------------
    // Manage registry
    // -----------------------------

    public func newPackageRelease(newRelease : NewPackageReleaseArgs) : PackagePublication {
      let packageId = PackageUtils.getPackageId(newRelease.config.name, newRelease.config.version);

      _updateHighestConfig(newRelease.config);

      let versions = Option.get(packageVersions.get(newRelease.config.name), []);
      packageVersions.put(newRelease.config.name, Array.append(versions, [newRelease.config.version]));

      packageConfigs.put(packageId, newRelease.config);

      // add owner for new package
      let owners = getPackageOwners(newRelease.config.name);
      if (owners.size() == 0) {
        ownersByPackage.put(newRelease.config.name, [newRelease.userId]);
      };

      let publication = {
        user = newRelease.userId;
        time = Time.now();
        storage = newRelease.storageId;
      };
      packagePublications.put(packageId, publication);

      fileIdsByPackage.put(packageId, newRelease.fileIds);

      for ((fileId, hash) in newRelease.fileHashes.vals()) {
        hashByFileId.put(fileId, hash);
      };

      switch (newRelease.fileStats) {
        case (?fileStats) {
          packageFileStats.put(packageId, fileStats);
        };
        case (null) {};
      };

      switch (newRelease.testStats) {
        case (?testStats) {
          packageTestStats.put(packageId, testStats);
        };
        case (null) {};
      };

      packageBenchmarks.put(packageId, newRelease.benchmarks);
      packageNotes.put(packageId, newRelease.notes);
      packageDocsCoverage.put(packageId, newRelease.docsCoverage);

      publication;
    };

    func _updateHighestConfig(config : PackageConfigV3) {
      switch (getHighestVersion(config.name)) {
        case (?ver) {
          if (Semver.compare(config.version, ver) == #greater) {
            highestConfigs.put(config.name, config);
          };
        };
        case (null) {
          highestConfigs.put(config.name, config);
        };
      };
    };

    // -----------------------------
    // All packages
    // -----------------------------

    public func getHighestConfigs() : [PackageConfigV3] {
      Iter.toArray(highestConfigs.vals());
    };

    public func getAllConfigs() : [PackageConfigV3] {
      Iter.toArray(packageConfigs.vals());
    };

    // -----------------------------
    // By package name
    // -----------------------------

    public func getPackageVersions(name : PackageName) : ?[PackageVersion] {
      packageVersions.get(name);
    };

    public func getHighestVersion(name : PackageName) : ?PackageVersion {
      let ?versions = packageVersions.get(name) else return null;
      let verSorted = Array.sort(versions, Semver.compare);

      if (verSorted.size() != 0) {
        return ?verSorted[verSorted.size() - 1];
      };
      return null;
    };

    // -----------------------------
    // By package name and version
    // -----------------------------

    public func getPackageConfig(name : PackageName, version : PackageVersion) : ?PackageConfigV3 {
      packageConfigs.get(PackageUtils.getPackageId(name, version));
    };

    public func getPackagePublication(name : PackageName, version : PackageVersion) : ?PackagePublication {
      packagePublications.get(PackageUtils.getPackageId(name, version));
    };

    public func getPackageFileStats(name : PackageName, version : PackageVersion) : PackageFileStats {
      Option.get(packageFileStats.get(PackageUtils.getPackageId(name, version)), PackageUtils.defaultPackageFileStats());
    };

    public func getPackageTestStats(name : PackageName, version : PackageVersion) : TestStats {
      Option.get(packageTestStats.get(PackageUtils.getPackageId(name, version)), { passed = 0; passedNames = [] });
    };

    public func getPackageBenchmarks(name : PackageName, version : PackageVersion) : Benchmarks {
      Option.get(packageBenchmarks.get(PackageUtils.getPackageId(name, version)), []);
    };

    public func getPackageReleaseNotes(name : PackageName, version : PackageVersion) : Text {
      Option.get(packageNotes.get(PackageUtils.getPackageId(name, version)), "");
    };

    public func getPackageDocsCoverage(name : PackageName, version : PackageVersion) : Float {
      Option.get(packageDocsCoverage.get(PackageUtils.getPackageId(name, version)), 0.0);
    };

    // -----------------------------
    // Package ownership
    // -----------------------------

    public func getPackageOwners(name : PackageName) : [Principal] {
      Option.get(ownersByPackage.get(name), []);
    };

    public func getPackageMaintainers(name : PackageName) : [Principal] {
      Option.get(maintainersByPackage.get(name), []);
    };

    public func isOwner(name : PackageName, principal : Principal) : Bool {
      for (owner in getPackageOwners(name).vals()) {
        if (owner == principal) {
          return true;
        };
      };
      return false;
    };

    public func isMaintainer(name : PackageName, principal : Principal) : Bool {
      for (maintainer in getPackageMaintainers(name).vals()) {
        if (maintainer == principal) {
          return true;
        };
      };
      return false;
    };

    public func addOwner(caller : Principal, packageName : PackageName, newOwner : Principal) : Result.Result<(), Text> {
      let ?owners = ownersByPackage.get(packageName) else return #err("Package not found");

      if (isOwner(packageName, newOwner)) {
        return #err("User is already an owner");
      };
      if (not isOwner(packageName, caller)) {
        return #err("Only owners can add owners");
      };
      if (owners.size() >= 5) {
        return #err("Maximum number of owners reached");
      };

      ownersByPackage.put(packageName, Array.append(owners, [newOwner]));
      #ok;
    };

    public func addMaintainer(caller : Principal, packageName : PackageName, newMaintainer : Principal) : Result.Result<(), Text> {
      let maintainers = Option.get(maintainersByPackage.get(packageName), []);

      if (isMaintainer(packageName, newMaintainer)) {
        return #err("User is already a maintainer");
      };
      if (not isOwner(packageName, caller)) {
        return #err("Only owners can add maintainers");
      };
      if (maintainers.size() >= 5) {
        return #err("Maximum number of maintainers reached");
      };

      maintainersByPackage.put(packageName, Array.append(maintainers, [newMaintainer]));
      #ok;
    };

    public func removeOwner(caller : Principal, packageName : PackageName, ownerToRemove : Principal) : Result.Result<(), Text> {
      let ?owners = ownersByPackage.get(packageName) else return #err("Package not found");

      if (not isOwner(packageName, ownerToRemove)) {
        return #err("User is not an owner");
      };
      if (not isOwner(packageName, caller)) {
        return #err("Only owners can remove owners");
      };
      if (owners.size() <= 1) {
        return #err("At least one owner is required");
      };

      ownersByPackage.put(
        packageName,
        Array.filter(
          owners,
          func(owner : Principal) : Bool {
            owner != ownerToRemove;
          },
        ),
      );
      #ok;
    };

    public func removeMaintainer(caller : Principal, packageName : PackageName, maintainerToRemove : Principal) : Result.Result<(), Text> {
      let maintainers = Option.get(maintainersByPackage.get(packageName), []);

      if (not isMaintainer(packageName, maintainerToRemove)) {
        return #err("User is not a maintainer");
      };
      if (not isOwner(packageName, caller)) {
        return #err("Only owners can remove maintainers");
      };

      maintainersByPackage.put(
        packageName,
        Array.filter(
          maintainers,
          func(maintainer : Principal) : Bool {
            maintainer != maintainerToRemove;
          },
        ),
      );
      #ok;
    };
  };
};
