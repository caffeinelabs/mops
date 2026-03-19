import Time "mo:base/Time";
import Debug "mo:base/Debug";
import Array "mo:base/Array";
import Principal "mo:base/Principal";
import { DAY } "mo:time-consts";

import Types "../types";
import Registry "./Registry";
import DownloadLog "../DownloadLog";
import Users "../Users";
import PackageUtils "../utils/package-utils";

import { getPackageChanges } "./getPackageChanges";

module {
  public type PackageName = Types.PackageName;
  public type PackageVersion = Types.PackageVersion;
  public type PackageSummary = Types.PackageSummary;
  public type PackageQuality = Types.PackageQuality;
  public type DepsStatus = Types.DepsStatus;
  public type PackageSummaryWithChanges = Types.PackageSummaryWithChanges;

  // lightweight package summary
  public func getPackageSummary(registry : Registry.Registry, users : Users.Users, downloadLog : DownloadLog.DownloadLog, name : PackageName, version : PackageVersion, includeTempDownloads : Bool) : ?PackageSummary {
    do ? {
      let config = registry.getPackageConfig(name, version)!;

      let publication = registry.getPackagePublication(name, version)!;
      users.ensureUser(publication.user);

      let owners = registry.getPackageOwners(name);
      for (owner in owners.vals()) {
        users.ensureUser(owner);
      };

      let maintainers = registry.getPackageMaintainers(name);
      for (maintainer in maintainers.vals()) {
        users.ensureUser(maintainer);
      };

      let owner = if (owners.size() > 0) owners[0] else Principal.fromText("aaaaa-aa");
      let highestVersion = registry.getHighestVersion(name)!;

      return ?{
        depAlias = "";
        owner = owner; // legacy
        ownerInfo = users.getUser(owner); // legacy
        owners = Array.map(owners, users.getUser);
        maintainers = Array.map(maintainers, users.getUser);
        config = config;
        publication = publication;
        publisher = users.getUser(publication.user);
        downloadsInLast7Days = downloadLog.getDownloadsByPackageNameIn(config.name, 7 * DAY, Time.now(), includeTempDownloads);
        downloadsInLast30Days = downloadLog.getDownloadsByPackageNameIn(config.name, 30 * DAY, Time.now(), includeTempDownloads);
        downloadsTotal = downloadLog.getTotalDownloadsByPackageName(config.name);
        quality = _computePackageQuality(registry, name, version);
        highestVersion = highestVersion;
      };
    };
  };

  // package summary with changes between this version and previous version
  public func getPackageSummaryWithChanges(registry : Registry.Registry, users : Users.Users, downloadLog : DownloadLog.DownloadLog, name : PackageName, version : PackageVersion) : ?PackageSummaryWithChanges {
    let ?packageSummary = getPackageSummary(registry, users, downloadLog, name, version, false) else return null;
    ?{
      packageSummary with
      changes = getPackageChanges(registry, name, version);
    };
  };

  // package quality
  func _computePackageQuality(registry : Registry.Registry, name : PackageName, version : PackageVersion) : PackageQuality {
    let packageId = PackageUtils.getPackageId(name, version);
    let ?config = registry.getPackageConfig(name, version) else Debug.trap("Package '" # packageId # "' not found");

    {
      hasDescription = config.description.size() > 10;
      hasKeywords = config.keywords.size() > 0;
      hasLicense = config.license != "";
      hasRepository = config.repository.size() > 20;
      hasDocumentation = registry.getPackageFileStats(name, version).docsCount > 0; // legacy
      depsStatus = _computeDepsStatus(registry, name, version);
      hasTests = registry.getPackageTestStats(name, version).passed > 0;
      hasReleaseNotes = registry.getPackageReleaseNotes(name, version).size() > 10;
      docsCoverage = registry.getPackageDocsCoverage(name, version);
    };
  };

  // deps status
  func _computeDepsStatus(registry : Registry.Registry, name : PackageName, version : PackageVersion) : DepsStatus {
    let packageId = PackageUtils.getPackageId(name, version);
    let ?config = registry.getPackageConfig(name, version) else Debug.trap("Package '" # packageId # "' not found");

    var status : DepsStatus = #allLatest;

    label l for (dep in config.dependencies.vals()) {
      if (dep.version == "") {
        continue l;
      };

      let depName = PackageUtils.getDepName(dep.name);

      let ?highestVersion = registry.getHighestVersion(depName) else Debug.trap("Package '" # dep.name # "' not found");

      if (dep.version != highestVersion) {
        status := #updatesAvailable;

        let depId = PackageUtils.getPackageId(dep.name, dep.version);
        let ?publication = registry.getPackagePublication(depName, dep.version) else Debug.trap("Package '" # depId # "' not found");

        if (publication.time < Time.now() - 180 * DAY) {
          status := #tooOld;
          break l;
        };
      };
    };

    status;
  };
};
