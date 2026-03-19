import Array "mo:base/Array";
import Debug "mo:base/Debug";

import Types "../types";
import Registry "./Registry";
import DownloadLog "../DownloadLog";
import Users "../Users";
import PackageUtils "../utils/package-utils";

import { getPackageSummary; getPackageSummaryWithChanges } "./getPackageSummary";
import { getPackageChanges } "./getPackageChanges";
import { getPackageDependents } "./getPackageDependents";

module {
  let MAX_VERSION_HISTORY = 5;
  let MAX_DEPENDENTS = 10;

  public type PackageName = Types.PackageName;
  public type PackageVersion = Types.PackageVersion;
  public type PackageSummary = Types.PackageSummary;
  public type PackageDetails = Types.PackageDetails;
  public type PackageSummaryWithChanges = Types.PackageSummaryWithChanges;
  public type DependencyV2 = Types.DependencyV2;
  public type PackageConfigV3 = Types.PackageConfigV3;

  // all package versions
  func _getPackageVersions(registry : Registry.Registry, name : PackageName) : [PackageVersion] {
    let ?versions = registry.getPackageVersions(name) else Debug.trap("Package '" # name # "' not found");
    versions;
  };

  // all package versions with summaies and changes
  func _getPackageVersionHistory(registry : Registry.Registry, users : Users.Users, downloadLog : DownloadLog.DownloadLog, name : PackageName) : [PackageSummaryWithChanges] {
    let ?versions = registry.getPackageVersions(name) else Debug.trap("Package '" # name # "' not found");
    versions
    |> Array.take(_, -MAX_VERSION_HISTORY)
    |> Array.reverse(_)
    |> Array.map<PackageVersion, PackageSummaryWithChanges>(
      _,
      func(version) {
        let ?summary = getPackageSummaryWithChanges(registry, users, downloadLog, name, version) else Debug.trap("Package '" # name # "' not found");
        summary;
      },
    );
  };

  func _getDepsSummaries(registry : Registry.Registry, users : Users.Users, downloadLog : DownloadLog.DownloadLog, deps : [DependencyV2]) : [PackageSummary] {
    let filtered = Array.filter<DependencyV2>(
      deps,
      func(dep) {
        dep.repo == "";
      },
    );
    Array.map<DependencyV2, PackageSummary>(
      filtered,
      func(dep) {
        let ?summary = getPackageSummary(registry, users, downloadLog, PackageUtils.getDepName(dep.name), dep.version, false) else Debug.trap("Package '" # dep.name # "' not found");
        {
          summary with
          depAlias = dep.name;
        };
      },
    );
  };

  // dependencies
  func _getPackageDependencies(registry : Registry.Registry, users : Users.Users, downloadLog : DownloadLog.DownloadLog, name : PackageName, version : PackageVersion) : {
    deps : [PackageSummary];
    devDeps : [PackageSummary];
  } {
    let packageId = PackageUtils.getPackageId(name, version);
    let ?config = registry.getPackageConfig(name, version) else Debug.trap("Package '" # packageId # "' not found");
    let deps = _getDepsSummaries(registry, users, downloadLog, config.dependencies);
    let devDeps = _getDepsSummaries(registry, users, downloadLog, config.devDependencies);
    { deps; devDeps };
  };

  // package details that appear on the package page
  public func getPackageDetails(registry : Registry.Registry, users : Users.Users, downloadLog : DownloadLog.DownloadLog, name : PackageName, version : PackageVersion) : ?PackageDetails {
    // return package details
    do ? {
      let summary = getPackageSummary(registry, users, downloadLog, name, version, true)!;
      let fileStats = registry.getPackageFileStats(name, version);
      let { deps; devDeps } = _getPackageDependencies(registry, users, downloadLog, name, version);
      let (dependents, dependentsCount) = getPackageDependents(registry, users, downloadLog, name, MAX_DEPENDENTS, 0);

      return ?{
        summary with
        versions = _getPackageVersions(registry, name);
        versionHistory = _getPackageVersionHistory(registry, users, downloadLog, name);
        deps;
        devDeps;
        dependents;
        dependentsCount;
        downloadTrend = downloadLog.getDownloadTrendByPackageName(name);
        fileStats = {
          sourceFiles = fileStats.sourceFiles;
          sourceSize = fileStats.sourceSize;
        };
        testStats = registry.getPackageTestStats(name, version);
        benchmarks = registry.getPackageBenchmarks(name, version);
        changes = getPackageChanges(registry, name, version);
        docsCoverage = registry.getPackageDocsCoverage(name, version);
      };
    };
  };
};
