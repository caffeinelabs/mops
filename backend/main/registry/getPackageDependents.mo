import Array "mo:base/Array";
import Debug "mo:base/Debug";
import Hash "mo:base/Hash";
import TrieSet "mo:base/TrieSet";
import Option "mo:base/Option";
import Text "mo:base/Text";
import Nat "mo:base/Nat";

import Types "../types";
import Registry "./Registry";
import Users "../Users";
import DownloadLog "../DownloadLog";
import PackageUtils "../utils/package-utils";

import { getPackageSummary } "./getPackageSummary";

module {
  type PackageName = Types.PackageName;
  type PackageVersion = Types.PackageVersion;
  type PackageSummary = Types.PackageSummary;
  type PackageConfigV3 = Types.PackageConfigV3;
  type DependencyV2 = Types.DependencyV2;

  public func getPackageDependents(registry : Registry.Registry, users : Users.Users, downloadLog : DownloadLog.DownloadLog, name : PackageName, limit : Nat, _offset : Nat) : ([PackageSummary], Nat) {
    func isDependent(config : PackageConfigV3) : Bool {
      let dependent = Option.isSome(
        Array.find<DependencyV2>(
          config.dependencies,
          func(dep : DependencyV2) {
            PackageUtils.getDepName(dep.name) == name and dep.repo == "";
          },
        )
      );
      if (dependent) {
        return true;
      };
      let devDependent = Option.isSome(
        Array.find<DependencyV2>(
          config.devDependencies,
          func(dep : DependencyV2) {
            PackageUtils.getDepName(dep.name) == name and dep.repo == "";
          },
        )
      );
      devDependent;
    };

    let dependentConfigs = Array.filter<PackageConfigV3>(registry.getHighestConfigs(), isDependent);

    let pkgHash = func(a : PackageConfigV3) : Hash.Hash {
      Text.hash(a.name);
    };
    let pkgEqual = func(a : PackageConfigV3, b : PackageConfigV3) : Bool {
      a.name == b.name;
    };
    let unique = TrieSet.toArray(TrieSet.fromArray<PackageConfigV3>(dependentConfigs, pkgHash, pkgEqual));
    let limited = Array.take(unique, limit);

    let summaries = Array.map<PackageConfigV3, PackageSummary>(
      limited,
      func(config) {
        let ?summary = getPackageSummary(registry, users, downloadLog, config.name, config.version, false) else Debug.trap("Package '" # name # "' not found");
        summary;
      },
    );

    let sorted = Array.sort<PackageSummary>(
      summaries,
      func(a, b) {
        Nat.compare(b.downloadsTotal, a.downloadsTotal);
      },
    );

    (sorted, Array.size(unique));
  };
};
