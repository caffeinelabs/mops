import Array "mo:base/Array";
import Text "mo:base/Text";
import Option "mo:base/Option";
import Buffer "mo:base/Buffer";
import Nat "mo:base/Nat";
import Debug "mo:base/Debug";
import Principal "mo:base/Principal";
import PrincipalExt "mo:principal-ext";

import Registry "./Registry";
import DownloadLog "../DownloadLog";
import Types "../types";
import Utils "../../utils";
import Users "../Users";
import { getPackageSummary } "./getPackageSummary";

module {
  public type PackageSummary = Types.PackageSummary;
  public type PackageConfigV3 = Types.PackageConfigV3;
  public type PageCount = Nat;

  public func searchInRegistry(registry : Registry.Registry, users : Users.Users, downloadLog : DownloadLog.DownloadLog, searchText : Text, limitOpt : ?Nat, pageIndexOpt : ?Nat) : ([PackageSummary], PageCount) {
    let limit = Option.get(limitOpt, 20);
    let pageIndex = Option.get(pageIndexOpt, 0);

    assert (limit <= 200);
    assert (pageIndex <= 1_000_000);
    assert (searchText.size() <= 100);

    type ConfigWithPoints = {
      config : PackageConfigV3;
      sortingPoints : Nat;
    };
    let matchedConfigs = Buffer.Buffer<ConfigWithPoints>(0);
    let pattern = #text(Text.toLowercase(searchText));

    for (config in registry.getHighestConfigs().vals()) {
      var sortingPoints = 0;

      // search by owner
      if (Text.startsWith(searchText, #text("owner:"))) {
        ignore do ? {
          let searchOwnerNameOrId = Text.stripStart(searchText, #text("owner:"))!;
          let owners = registry.getPackageOwners(config.name);

          // search by owner id
          if (Option.isSome(PrincipalExt.fromText(searchOwnerNameOrId))) {
            for (ownerId in owners.vals()) {
              if (searchOwnerNameOrId == Principal.toText(ownerId)) {
                sortingPoints += 3;
              };
            };
          }
          // search by owner name
          else {
            for (ownerId in owners.vals()) {
              let ownerInfo = users.getUserOpt(ownerId)!;
              if (searchOwnerNameOrId == ownerInfo.name) {
                sortingPoints += 3;
              };
            };
          };
        };
      }
      // search by keyword
      else if (Text.startsWith(searchText, #text("keyword:"))) {
        ignore do ? {
          let searchKeyword = Text.stripStart(searchText, #text("keyword:"))!;
          let found = Array.find(
            config.keywords,
            func(keyword : Text) : Bool {
              keyword == searchKeyword;
            },
          );
          if (found != null) {
            sortingPoints += 3;
          };
        };
      } else {
        if (config.name == searchText) {
          sortingPoints += 10;
        };
        if (Text.contains(config.name, pattern)) {
          sortingPoints += 3;
        };
        if (Text.contains(Text.toLowercase(config.description), pattern)) {
          sortingPoints += 1;
        };
        for (keyword in config.keywords.vals()) {
          if (Text.contains(Text.toLowercase(keyword), pattern)) {
            sortingPoints += 2;
          };
        };
      };

      if (sortingPoints > 0) {
        matchedConfigs.add({ config; sortingPoints });
      };
    };

    var configs = Array.sort<ConfigWithPoints>(
      Buffer.toArray(matchedConfigs),
      func(a, b) {
        var aPoints = a.sortingPoints;
        var bPoints = b.sortingPoints;

        if (a.config.name.size() < b.config.name.size()) aPoints += 1;
        if (a.config.name.size() > b.config.name.size()) bPoints += 1;

        Nat.compare(bPoints, aPoints);
      },
    );

    let page = Utils.getPage(configs, pageIndex, limit);

    let summaries = Array.map<ConfigWithPoints, PackageSummary>(
      page.0,
      func(config) {
        let ?summary = getPackageSummary(registry, users, downloadLog, config.config.name, config.config.version, true) else Debug.trap("Package '" # config.config.name # "' not found");
        summary;
      },
    );

    (summaries, page.1);
  };
};
