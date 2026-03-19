import Text "mo:base/Text";
import Array "mo:base/Array";
import Buffer "mo:base/Buffer";
import TrieMap "mo:base/TrieMap";
import Iter "mo:base/Iter";
import Time "mo:base/Time";
import Int "mo:base/Int";
import Result "mo:base/Result";
import Debug "mo:base/Debug";
import Principal "mo:base/Principal";
import Order "mo:base/Order";
import Option "mo:base/Option";
import Blob "mo:base/Blob";
import TelegramBot "mo:telegram-bot";

import IC "mo:ic";
import { DAY } "mo:time-consts";
import Backup "mo:backup";
import Sha256 "mo:sha2/Sha256";
import HttpTypes "mo:http-types";
import Set "mo:map/Set";

import Utils "../utils";
import Semver "./utils/semver";
import Types "./types";
import DownloadLog "./DownloadLog";
import StorageManager "../storage/storage-manager";
import Storage "../storage/storage-canister";
import Users "./Users";
import Badges "./badges";

import Registry "./registry/Registry";
import PackagePublisher "./PackagePublisher";
import { searchInRegistry } "./registry/searchInRegistry";
import { getPackageSummary; getPackageSummaryWithChanges } "./registry/getPackageSummary";
import { getPackageDetails = _getPackageDetails } "./registry/getPackageDetails";
import { packagesByCategory } "./registry/packagesByCategory";
import { getDefaultPackages = _getDefaultPackages } "./registry/getDefaultPackages";
import { getPackageDependents = _getPackageDependents } "./registry/getPackageDependents";
import { verifyPackageRepository } "./verifyPackageRepository";
import PackageUtils "./utils/package-utils";

actor class Main() = this {
  public type PackageName = Text.Text; // lib
  public type PackageVersion = Types.PackageVersion; // 1.2.3
  public type PackageId = Text.Text; // lib@1.2.3
  public type FileId = Types.FileId;
  public type Err = Text.Text;
  public type PackageConfigV2 = Types.PackageConfigV2;
  public type PackageConfigV3 = Types.PackageConfigV3;
  public type PackagePublication = Types.PackagePublication;
  public type PackageDetails = Types.PackageDetails;
  public type PackageSummary = Types.PackageSummary;
  public type PackageSummaryWithChanges = Types.PackageSummaryWithChanges;
  public type PackageFileStats = Types.PackageFileStats;
  public type DownloadsSnapshot = Types.DownloadsSnapshot;
  public type User = Types.User;
  public type PageCount = Nat;
  public type SemverPart = Types.SemverPart;
  public type TestStats = Types.TestStats;
  public type PublishingId = Text;
  public type Benchmarks = Types.Benchmarks;

  let API_VERSION = "1.3"; // (!) make changes in pair with cli

  var packageVersions = TrieMap.TrieMap<PackageName, [PackageVersion]>(Text.equal, Text.hash);
  var packageOwners = TrieMap.TrieMap<PackageName, Principal>(Text.equal, Text.hash); // legacy
  var ownersByPackage = TrieMap.TrieMap<PackageName, [Principal]>(Text.equal, Text.hash);
  var maintainersByPackage = TrieMap.TrieMap<PackageName, [Principal]>(Text.equal, Text.hash);
  var highestConfigs = TrieMap.TrieMap<PackageName, PackageConfigV3>(Text.equal, Text.hash);

  var packageConfigs = TrieMap.TrieMap<PackageId, PackageConfigV3>(Text.equal, Text.hash);
  var packagePublications = TrieMap.TrieMap<PackageId, PackagePublication>(Text.equal, Text.hash);
  var fileIdsByPackage = TrieMap.TrieMap<PackageId, [FileId]>(Text.equal, Text.hash);
  var hashByFileId = TrieMap.TrieMap<FileId, Blob>(Text.equal, Text.hash);
  var packageFileStats = TrieMap.TrieMap<PackageId, PackageFileStats>(Text.equal, Text.hash);
  var packageTestStats = TrieMap.TrieMap<PackageId, TestStats>(Text.equal, Text.hash);
  var packageBenchmarks = TrieMap.TrieMap<PackageId, Benchmarks>(Text.equal, Text.hash);
  var packageNotes = TrieMap.TrieMap<PackageId, Text>(Text.equal, Text.hash);
  var packageDocsCoverage = TrieMap.TrieMap<PackageId, Float>(Text.equal, Text.hash);

  var registry = Registry.Registry(
    packageVersions,
    ownersByPackage,
    maintainersByPackage,
    highestConfigs,
    packageConfigs,
    packagePublications,
    fileIdsByPackage,
    hashByFileId,
    packageFileStats,
    packageTestStats,
    packageBenchmarks,
    packageNotes,
    packageDocsCoverage,
  );

  let downloadLog = DownloadLog.DownloadLog();
  downloadLog.setTimers<system>();

  let storageManager = StorageManager.StorageManager();
  let users = Users.Users();

  var packagePublisher = PackagePublisher.PackagePublisher(registry, storageManager);

  // PRIVATE
  func _resolveVersion(name : PackageName, version : PackageVersion) : ?PackageVersion {
    if (version == "highest") {
      registry.getHighestVersion(name);
    } else {
      ?version;
    };
  };

  func _getPackageSummary(name : PackageName, version : PackageVersion, includeTempDownloads : Bool) : ?PackageSummary {
    getPackageSummary(registry, users, downloadLog, name, version, includeTempDownloads);
  };

  func _getPackageSummaryWithChanges(name : PackageName, version : PackageVersion) : ?PackageSummaryWithChanges {
    getPackageSummaryWithChanges(registry, users, downloadLog, name, version);
  };

  public shared query func transformRequest(arg : IC.TransformArg) : async IC.HttpRequestResult {
    {
      status = arg.response.status;
      body = arg.response.body;
      headers = [];
    };
  };

  let transform : IC.Transform = {
    function = transformRequest;
    context = Blob.fromArray([]);
  };

  func _verifyPackageRepo(config : PackageConfigV3) : async Result.Result<(), Err> {
    await verifyPackageRepository(config.name, config.repository, transform);
  };

  // PUBLIC

  // Publication
  public shared ({ caller }) func startPublish(configPub : Types.PackageConfigV3_Publishing) : async Result.Result<PublishingId, Err> {
    let config : PackageConfigV3 = {
      configPub with
      requirements = Option.get(configPub.requirements, []);
    };

    let pubRes = await packagePublisher.startPublish(caller, config);
    if (Result.isErr(pubRes)) {
      return pubRes;
    };

    let repoVerifyRes = await _verifyPackageRepo(config);
    switch (repoVerifyRes) {
      case (#ok) {};
      case (#err(err)) {
        return #err(err);
      };
    };

    return pubRes;
  };

  public shared ({ caller }) func startFileUpload(publishingId : PublishingId, path : Text.Text, chunkCount : Nat, firstChunk : Blob) : async Result.Result<FileId, Err> {
    await packagePublisher.startFileUpload(caller, publishingId, path, chunkCount, firstChunk);
  };

  public shared ({ caller }) func uploadFileChunk(publishingId : PublishingId, fileId : FileId, chunkIndex : Nat, chunk : Blob) : async Result.Result<(), Err> {
    await packagePublisher.uploadFileChunk(caller, publishingId, fileId, chunkIndex, chunk);
  };

  public shared ({ caller }) func uploadTestStats(publishingId : PublishingId, testStats : TestStats) : async Result.Result<(), Err> {
    packagePublisher.uploadTestStats(caller, publishingId, testStats);
  };

  public shared ({ caller }) func uploadNotes(publishingId : PublishingId, notes : Text) : async Result.Result<(), Err> {
    packagePublisher.uploadNotes(caller, publishingId, notes);
  };

  public shared ({ caller }) func uploadBenchmarks(publishingId : PublishingId, benchmarks : Benchmarks) : async Result.Result<(), Err> {
    packagePublisher.uploadBenchmarks(caller, publishingId, benchmarks);
  };

  public shared ({ caller }) func uploadDocsCoverage(publishingId : PublishingId, docsCoverage : Float) : async Result.Result<(), Err> {
    packagePublisher.uploadDocsCoverage(caller, publishingId, docsCoverage);
  };

  stable var telegramBotToken = "";

  public shared ({ caller }) func setTelegramBotToken(token : Text) : async () {
    assert (Utils.isAdmin(caller));
    telegramBotToken := token;
  };

  public shared ({ caller }) func finishPublish(publishingId : PublishingId) : async Result.Result<(), Err> {
    let res = await packagePublisher.finishPublish(caller, publishingId);

    switch (res) {
      case (#err(err)) {
        #err(err);
      };
      case (#ok(publishResult)) {
        // Send Telegram notification
        let telegramBot = TelegramBot.TelegramBot(telegramBotToken, transformTelegramRequest);
        let message = _formatTelegramMessage(publishResult.config, publishResult.publication, publishResult.isNewPackage);
        let tgRes = await telegramBot.sendMessage("@mops_feed", message, null);

        switch (tgRes) {
          case (#err(err)) {
            Debug.print("Failed to send message to telegram: " # err);
          };
          case (#ok) {};
        };

        #ok;
      };
    };
  };

  public query func transformTelegramRequest(arg : IC.TransformArg) : async IC.HttpRequestResult {
    TelegramBot.transformRequest(arg);
  };

  func _principalToCompactText(principal : Principal) : Text {
    let parts = Iter.toArray(Text.split(Principal.toText(principal), #char('-')));
    if (parts.size() < 2) {
      return "";
    };
    parts[0] # "..." # parts[parts.size() - 1];
  };

  func _formatTelegramMessage(config : PackageConfigV3, publication : PackagePublication, isNewPackage : Bool) : Text {
    let userOpt = users.getUserOpt(publication.user);
    var userName = Option.getMapped<User, Text>(userOpt, func user = user.name, "");
    if (userName == "") {
      userName := _principalToCompactText(publication.user);
    };

    let packageUrl = "https://mops.one/" # config.name;

    if (isNewPackage) {
      "New Motoko package!\n\n📦" # config.name # " - " # config.description # "\n\nAuthor - " # userName # "\nLearn more - " # packageUrl;
    } else {
      let ?summary = _getPackageSummaryWithChanges(config.name, config.version) else Debug.trap("Package '" # config.name # "' not found");
      var releaseNotes = "";
      if (summary.changes.notes != "") {
        releaseNotes := "\n\n📄 Release notes:\n" # summary.changes.notes;
      };
      "Package updated!\n\n📦" # config.name # " v" # config.version # " - " # config.description # "\n\nAuthor - " # userName # "\nLearn more - " # packageUrl # releaseNotes;
    };
  };

  public shared ({ caller }) func computeHashesForExistingFiles() : async () {
    assert (Utils.isAdmin(caller));

    for ((packageId, fileIds) in fileIdsByPackage.entries()) {
      let ?publication = packagePublications.get(packageId) else Debug.trap("Package publication '" # packageId # "' not found");
      let storage = actor (Principal.toText(publication.storage)) : Storage.Storage;

      label l for (fileId in fileIds.vals()) {
        if (hashByFileId.get(fileId) != null) {
          continue l;
        };
        let #ok(fileMeta) = await storage.getFileMeta(fileId) else Debug.trap("File meta '" # fileId # "' not found");

        let hasher = Sha256.Digest(#sha256);
        for (i in Iter.range(0, fileMeta.chunkCount - 1)) {
          let #ok(chunk) = await storage.downloadChunk(fileId, i) else Debug.trap("File chunk '" # fileId # "' not found");
          hasher.writeBlob(chunk);
        };
        hashByFileId.put(fileId, hasher.sum());
      };
    };
  };

  public shared ({ caller }) func setStorageControllers() : async () {
    assert (Utils.isAdmin(caller));
    let self = Principal.fromActor(this);
    let cycleOpsBlackhole = Principal.fromText("2daxo-giaaa-aaaap-anvca-cai");
    await storageManager.setControllers([self, cycleOpsBlackhole]);
  };

  public shared ({ caller }) func takeSnapshotsIfNeeded() : async () {
    assert (Utils.isAdmin(caller));
    downloadLog.takeSnapshotsIfNeeded(Time.now());
  };

  // QUERY
  public query func getApiVersion() : async Text.Text {
    API_VERSION;
  };

  public query func getDefaultPackages(dfxVersion : Text) : async [(PackageName, PackageVersion)] {
    _getDefaultPackages(registry, dfxVersion);
  };

  public query func getHighestVersion(name : PackageName) : async Result.Result<PackageVersion, Err> {
    Result.fromOption(registry.getHighestVersion(name), "Package '" # name # "' not found");
  };

  func _getHighestSemver(name : PackageName, currentVersion : PackageVersion, semverPart : SemverPart) : Result.Result<PackageVersion, Err> {
    let packageId = PackageUtils.getPackageId(name, currentVersion);
    if (packageConfigs.get(packageId) == null) {
      return #err("Package '" # packageId # "' not found");
    };
    let ?versions = packageVersions.get(name) else return #err("Package '" # name # "' not found");

    var max = currentVersion;
    for (ver in versions.vals()) {
      let patchBigger = Semver.major(ver) == Semver.major(max) and Semver.minor(ver) == Semver.minor(max) and Semver.patch(ver) > Semver.patch(max);
      let minorBigger = Semver.major(ver) == Semver.major(max) and Semver.minor(ver) > Semver.minor(max) or patchBigger;
      let majorBigger = Semver.major(ver) > Semver.major(max) or minorBigger or patchBigger;

      switch (semverPart) {
        case (#major) {
          if (majorBigger) {
            max := ver;
          };
        };
        case (#minor) {
          if (minorBigger) {
            max := ver;
          };
        };
        case (#patch) {
          if (patchBigger) {
            max := ver;
          };
        };
      };
    };

    #ok(max);
  };

  public query func getHighestSemverBatch(list : [(PackageName, PackageVersion, SemverPart)]) : async Result.Result<[(PackageName, PackageVersion)], Err> {
    assert (list.size() < 100);

    let buf = Buffer.Buffer<(PackageName, PackageVersion)>(list.size());
    for ((name, currentVersion, semverPart) in list.vals()) {
      switch (_getHighestSemver(name, currentVersion, semverPart)) {
        case (#ok(ver)) {
          buf.add((name, ver));
        };
        case (#err(err)) {
          return #err(err);
        };
      };
    };
    #ok(Buffer.toArray(buf));
  };

  public query func getPackageDetails(name : PackageName, version : PackageVersion) : async Result.Result<PackageDetails, Err> {
    let packageDetails = do ? {
      let ver = _resolveVersion(name, version)!;
      _getPackageDetails(registry, users, downloadLog, name, ver)!;
    };
    Result.fromOption(packageDetails, "Package '" # name # "' not found");
  };

  public query func getPackageVersionHistory(name : PackageName) : async [PackageSummaryWithChanges] {
    let ?versions = registry.getPackageVersions(name) else Debug.trap("Package '" # name # "' not found");
    versions
    |> Array.reverse(_)
    |> Array.map<PackageVersion, PackageSummaryWithChanges>(
      _,
      func(version) {
        let ?summary = _getPackageSummaryWithChanges(name, version) else Debug.trap("Package '" # name # "' not found");
        summary;
      },
    );
  };

  public query func getPackageDependents(name : PackageName, limit : Nat, offset : Nat) : async ([PackageSummary], Nat) {
    _getPackageDependents(registry, users, downloadLog, name, limit, offset);
  };

  public query func getFileIds(name : PackageName, version : PackageVersion) : async Result.Result<[FileId], Err> {
    let packageId = PackageUtils.getPackageId(name, version);
    Result.fromOption(fileIdsByPackage.get(packageId), "Package '" # packageId # "' not found");
  };

  func _getFileHashes(packageId : PackageId) : Result.Result<[(FileId, Blob)], Err> {
    let ?fileIds = fileIdsByPackage.get(packageId) else return #err("Package '" # packageId # "' not found");
    let buf = Buffer.Buffer<(FileId, Blob)>(fileIds.size());
    for (fileId in fileIds.vals()) {
      let ?hash = hashByFileId.get(fileId) else return #err("File hash not found for " # fileId);
      buf.add((fileId, hash));
    };
    #ok(Buffer.toArray(buf));
  };

  public shared func getFileHashes(name : PackageName, version : PackageVersion) : async Result.Result<[(FileId, Blob)], Err> {
    let packageId = PackageUtils.getPackageId(name, version);
    _getFileHashes(packageId);
  };

  public query func getFileHashesQuery(name : PackageName, version : PackageVersion) : async Result.Result<[(FileId, Blob)], Err> {
    let packageId = PackageUtils.getPackageId(name, version);
    _getFileHashes(packageId);
  };

  public shared func getFileHashesByPackageIds(packageIds : [PackageId]) : async [(PackageId, [(FileId, Blob)])] {
    let buf = Buffer.Buffer<(PackageId, [(FileId, Blob)])>(packageIds.size());

    for (packageId in packageIds.vals()) {
      let hashes = switch (_getFileHashes(packageId)) {
        case (#ok(hashes)) hashes;
        case (#err(_)) [];
      };
      buf.add((packageId, hashes));
    };

    Buffer.toArray(buf);
  };

  func _notifyInstall(name : PackageName, version : PackageVersion, downloader : Principal) {
    let packageId = PackageUtils.getPackageId(name, version);

    if (packageConfigs.get(packageId) == null) {
      // Debug.trap("Package '" # packageId # "' not found");
      return;
    };

    downloadLog.add({
      time = Time.now();
      name;
      version;
      downloader;
    });
  };

  public shared ({ caller }) func notifyInstall(name : PackageName, version : PackageVersion) {
    _notifyInstall(name, version, caller);
  };

  public shared ({ caller }) func notifyInstalls(installs : [(PackageName, PackageVersion)]) {
    if (installs.size() > 100) {
      return;
    };
    for ((name, version) in installs.vals()) {
      _notifyInstall(name, version, caller);
    };
  };

  public query func search(searchText : Text.Text, limitOpt : ?Nat, pageIndexOpt : ?Nat) : async ([PackageSummary], PageCount) {
    searchInRegistry(registry, users, downloadLog, searchText, limitOpt, pageIndexOpt);
  };

  public query func getRecentlyUpdatedPackages() : async [PackageSummaryWithChanges] {
    let max = 5;
    let packages = Buffer.Buffer<PackageSummaryWithChanges>(max);

    let pubsSorted = Array.sort(
      Iter.toArray(packagePublications.entries()),
      func(a : (PackageId, PackagePublication), b : (PackageId, PackagePublication)) : Order.Order {
        Int.compare(b.1.time, a.1.time);
      },
    );

    label l for ((packageId, _) in pubsSorted.vals()) {
      ignore do ? {
        let config = packageConfigs.get(packageId)!;
        let packageSummaryWithChanges = _getPackageSummaryWithChanges(config.name, config.version)!;

        var has = false;
        label find for (details in packages.vals()) {
          if (details.config.name == config.name) {
            has := true;
            break find;
          };
        };

        if (not has) {
          packages.add(packageSummaryWithChanges);
        };

        if (packages.size() >= max) {
          break l;
        };
      };
    };

    Buffer.toArray(packages);
  };

  func _summariesFromNames(packageNames : [PackageName], limit : Nat, includeTempDownloads : Bool) : [PackageSummary] {
    let bufferSize = if (limit < packageNames.size()) limit else packageNames.size();
    let packages = Buffer.Buffer<PackageSummary>(bufferSize);

    label l for (packageName in packageNames.vals()) {
      ignore do ? {
        let version = registry.getHighestVersion(packageName)!;
        let packageSummary = _getPackageSummary(packageName, version, includeTempDownloads)!;

        packages.add(packageSummary);

        if (packages.size() >= limit) {
          break l;
        };
      };
    };

    Buffer.toArray(packages);
  };

  public query func getMostDownloadedPackages() : async [PackageSummary] {
    let packageNames = downloadLog.getMostDownloadedPackageNames(5);
    _summariesFromNames(packageNames, 5, true);
  };

  public query func getMostDownloadedPackagesIn7Days() : async [PackageSummary] {
    let packageNames = downloadLog.getMostDownloadedPackageNamesIn(7 * DAY, Time.now(), 5);
    _summariesFromNames(packageNames, 5, true);
  };

  func _sortByPublicationTime(summaries : [PackageSummary]) : [PackageSummary] {
    Array.sort<PackageSummary>(
      summaries,
      func(a, b) {
        Int.compare(b.publication.time, a.publication.time);
      },
    );
  };

  func _getPackageNamesForKeywords(keywords : [Text]) : [PackageName] {
    registry.getHighestConfigs()
    |> Array.filter<PackageConfigV3>(
      _,
      func(config) {
        Array.find<Text>(
          config.keywords,
          func(id : Text) {
            Array.find<Text>(
              keywords,
              func(keyword : Text) {
                id == keyword;
              },
            ) != null;
          },
        ) != null;
      },
    )
    |> Array.map<PackageConfigV3, PackageName>(
      _,
      func({ name }) {
        name;
      },
    );
  };

  func _combineUniq(arr1 : [Text], arr2 : [Text]) : [Text] {
    Iter.concat(arr1.vals(), arr2.vals())
    |> Set.fromIter(_, Set.thash)
    |> Set.toArray(_);
  };

  public query func getPackagesByCategory() : async [(Text, [PackageSummary])] {
    let limit = 10;

    packagesByCategory
    |> Array.map<{ title : Text; keywords : [Text]; legacyNames : [Text] }, (Text, [PackageSummary])>(_, func({ title; keywords; legacyNames }) { (title, _combineUniq(_getPackageNamesForKeywords(keywords), legacyNames) |> _summariesFromNames(_, 1000, false) |> _sortByPublicationTime(_) |> Array.take(_, limit)) });
  };

  public query func getNewPackages() : async [PackageSummary] {
    let packagesFirstPub = TrieMap.TrieMap<PackageName, (Time.Time, PackageVersion)>(Text.equal, Text.hash);
    for ((packageId, publication) in packagePublications.entries()) {
      let (packageName, packageVersion) = PackageUtils.parsePackageId(packageId);
      let firstPubTime = Option.get(packagesFirstPub.get(packageName), (Time.now(), packageVersion)).0;
      if (publication.time < firstPubTime) {
        packagesFirstPub.put(packageName, (publication.time, packageVersion));
      };
    };

    let packagesFirstPubSorted = Array.sort(
      Iter.toArray(packagesFirstPub.entries()),
      func(a : (PackageName, (Time.Time, PackageVersion)), b : (PackageName, (Time.Time, PackageVersion))) : Order.Order {
        Int.compare(b.1.0, a.1.0);
      },
    );

    packagesFirstPubSorted
    |> Array.take(_, 5)
    |> Array.map<(PackageName, (Time.Time, PackageVersion)), PackageSummary>(
      _,
      func((packageName, (pubTime, packageVersion))) {
        let ?summary = _getPackageSummary(packageName, packageVersion, false) else Debug.trap("Package '" # PackageUtils.getPackageId(packageName, packageVersion) # "' not found");
        summary;
      },
    );
  };

  public query func getDownloadTrendByPackageName(name : PackageName) : async [DownloadsSnapshot] {
    downloadLog.getDownloadTrendByPackageName(name);
  };

  public query func getDownloadTrendByPackageId(packageId : PackageId) : async [DownloadsSnapshot] {
    downloadLog.getDownloadTrendByPackageId(packageId);
  };

  public query func getTotalDownloads() : async Nat {
    downloadLog.getTotalDownloads();
  };

  public query func getTotalPackages() : async Nat {
    packageVersions.size();
  };

  public query func getStoragesStats() : async [(StorageManager.StorageId, StorageManager.StorageStats)] {
    storageManager.getStoragesStats();
  };

  // USERS
  public query func getUser(userId : Principal) : async ?User {
    users.getUserOpt(userId);
  };

  public shared ({ caller }) func setUserProp(prop : Text, value : Text) : async Result.Result<(), Text> {
    users.setUserProp(caller, prop, value);
  };

  public query func getPackageOwners(packageName : PackageName) : async [Principal] {
    registry.getPackageOwners(packageName);
  };

  public query func getPackageMaintainers(packageName : PackageName) : async [Principal] {
    registry.getPackageMaintainers(packageName);
  };

  public shared ({ caller }) func addOwner(packageName : PackageName, newOwner : Principal) : async Result.Result<(), Text> {
    registry.addOwner(caller, packageName, newOwner);
  };

  public shared ({ caller }) func addMaintainer(packageName : PackageName, newMaintainer : Principal) : async Result.Result<(), Text> {
    registry.addMaintainer(caller, packageName, newMaintainer);
  };

  public shared ({ caller }) func removeOwner(packageName : PackageName, owner : Principal) : async Result.Result<(), Text> {
    registry.removeOwner(caller, packageName, owner);
  };

  public shared ({ caller }) func removeMaintainer(packageName : PackageName, maintainer : Principal) : async Result.Result<(), Text> {
    registry.removeMaintainer(caller, packageName, maintainer);
  };

  // BADGES
  public query func http_request(request : HttpTypes.Request) : async HttpTypes.Response {
    let r404 : HttpTypes.Response = {
      status_code = 404;
      headers = [];
      body = Blob.fromArray([]);
      streaming_strategy = null;
      upgrade = null;
    };

    if (request.url == "/.well-known/ic-domains") {
      return {
        status_code = 200;
        headers = [];
        body = Text.encodeUtf8("registry.mops.one");
        streaming_strategy = null;
        upgrade = null;
      };
    };

    if (Text.startsWith(request.url, #text("/badge/"))) {
      let ?response = Badges.processHttpRequest(registry, request) else return r404;
      return response;
    };

    return r404;
  };

  // BACKUP
  stable let backupStateV2 = Backup.init(null);
  let backupManager = Backup.BackupManager(backupStateV2, { maxBackups = 20 });

  type BackupChunk = {
    #v9 : {
      #packagePublications : [(PackageId, PackagePublication)];
      #packageVersions : [(PackageName, [PackageVersion])];
      #ownersByPackage : [(PackageName, [Principal])];
      #maintainersByPackage : [(PackageName, [Principal])];
      #packageConfigs : [(PackageId, PackageConfigV3)];
      #highestConfigs : [(PackageName, PackageConfigV3)];
      #fileIdsByPackage : [(PackageId, [FileId])];
      #hashByFileId : [(FileId, Blob)];
      #packageFileStats : [(PackageId, PackageFileStats)];
      #packageTestStats : [(PackageId, TestStats)];
      #packageBenchmarks : [(PackageId, Benchmarks)];
      #packageNotes : [(PackageId, Text)];
      #packageDocsCoverage : [(PackageId, Float)];
      #downloadLog : DownloadLog.Stable;
      #storageManager : StorageManager.Stable;
      #users : Users.Stable;
    };
  };

  public shared ({ caller }) func backup() : async () {
    assert (Utils.isAdmin(caller));
    await _backup();
  };

  public query ({ caller }) func getBackupCanisterId() : async Principal {
    assert (Utils.isAdmin(caller));
    backupManager.getCanisterId();
  };

  func _backup() : async () {
    let backup = backupManager.NewBackup("v9");
    await backup.startBackup();
    await backup.uploadChunk(to_candid (#v9(#packagePublications(Iter.toArray(packagePublications.entries()))) : BackupChunk));
    await backup.uploadChunk(to_candid (#v9(#packageVersions(Iter.toArray(packageVersions.entries()))) : BackupChunk));
    await backup.uploadChunk(to_candid (#v9(#ownersByPackage(Iter.toArray(ownersByPackage.entries()))) : BackupChunk));
    await backup.uploadChunk(to_candid (#v9(#maintainersByPackage(Iter.toArray(maintainersByPackage.entries()))) : BackupChunk));
    await backup.uploadChunk(to_candid (#v9(#fileIdsByPackage(Iter.toArray(fileIdsByPackage.entries()))) : BackupChunk));
    await backup.uploadChunk(to_candid (#v9(#hashByFileId(Iter.toArray(hashByFileId.entries()))) : BackupChunk));
    await backup.uploadChunk(to_candid (#v9(#packageFileStats(Iter.toArray(packageFileStats.entries()))) : BackupChunk));
    await backup.uploadChunk(to_candid (#v9(#packageTestStats(Iter.toArray(packageTestStats.entries()))) : BackupChunk));
    await backup.uploadChunk(to_candid (#v9(#packageBenchmarks(Iter.toArray(packageBenchmarks.entries()))) : BackupChunk));
    await backup.uploadChunk(to_candid (#v9(#packageNotes(Iter.toArray(packageNotes.entries()))) : BackupChunk));
    await backup.uploadChunk(to_candid (#v9(#downloadLog(downloadLog.toStable())) : BackupChunk));
    await backup.uploadChunk(to_candid (#v9(#storageManager(storageManager.toStable())) : BackupChunk));
    await backup.uploadChunk(to_candid (#v9(#users(users.toStable())) : BackupChunk));
    await backup.uploadChunk(to_candid (#v9(#highestConfigs(Iter.toArray(highestConfigs.entries()))) : BackupChunk));
    await backup.uploadChunk(to_candid (#v9(#packageConfigs(Iter.toArray(packageConfigs.entries()))) : BackupChunk));
    await backup.uploadChunk(to_candid (#v9(#packageDocsCoverage(Iter.toArray(packageDocsCoverage.entries()))) : BackupChunk));
    await backup.finishBackup();
  };

  // RESTORE
  public shared ({ caller }) func restore(backupId : Nat) : async () {
    assert (false); // restore disabled
    assert (Utils.isAdmin(caller));

    await backupManager.restore(
      backupId,
      func(blob : Blob) {
        let ?#v9(chunk) : ?BackupChunk = from_candid (blob) else Debug.trap("Failed to restore chunk");

        switch (chunk) {
          case (#packagePublications(packagePublicationsStable)) {
            packagePublications := TrieMap.fromEntries<PackageId, PackagePublication>(packagePublicationsStable.vals(), Text.equal, Text.hash);
          };
          case (#packageVersions(packageVersionsStable)) {
            packageVersions := TrieMap.fromEntries<PackageName, [PackageVersion]>(packageVersionsStable.vals(), Text.equal, Text.hash);
          };
          case (#ownersByPackage(ownersByPackageStable)) {
            ownersByPackage := TrieMap.fromEntries<PackageName, [Principal]>(ownersByPackageStable.vals(), Text.equal, Text.hash);
          };
          case (#maintainersByPackage(maintainersByPackageStable)) {
            maintainersByPackage := TrieMap.fromEntries<PackageName, [Principal]>(maintainersByPackageStable.vals(), Text.equal, Text.hash);
          };
          case (#fileIdsByPackage(fileIdsByPackageStable)) {
            fileIdsByPackage := TrieMap.fromEntries<PackageId, [FileId]>(fileIdsByPackageStable.vals(), Text.equal, Text.hash);
          };
          case (#hashByFileId(hashByFileIdStable)) {
            hashByFileId := TrieMap.fromEntries<FileId, Blob>(hashByFileIdStable.vals(), Text.equal, Text.hash);
          };
          case (#packageFileStats(packageFileStatsStable)) {
            packageFileStats := TrieMap.fromEntries<PackageId, PackageFileStats>(packageFileStatsStable.vals(), Text.equal, Text.hash);
          };
          case (#packageTestStats(packageTestStatsStable)) {
            packageTestStats := TrieMap.fromEntries<PackageId, TestStats>(packageTestStatsStable.vals(), Text.equal, Text.hash);
          };
          case (#packageBenchmarks(packageBenchmarksStable)) {
            packageBenchmarks := TrieMap.fromEntries<PackageId, Benchmarks>(packageBenchmarksStable.vals(), Text.equal, Text.hash);
          };
          case (#packageNotes(packageNotesStable)) {
            packageNotes := TrieMap.fromEntries<PackageId, Text>(packageNotesStable.vals(), Text.equal, Text.hash);
          };
          case (#packageDocsCoverage(packageDocsCoverageStable)) {
            packageDocsCoverage := TrieMap.fromEntries<PackageId, Float>(packageDocsCoverageStable.vals(), Text.equal, Text.hash);
          };
          case (#downloadLog(downloadLogStable)) {
            downloadLog.cancelTimers();
            downloadLog.loadStable(downloadLogStable);
          };
          case (#storageManager(storageManagerStable)) {
            storageManager.loadStable(storageManagerStable);
          };
          case (#users(usersStable)) {
            users.loadStable(usersStable);
          };
          case (#highestConfigs(highestConfigsStable)) {
            highestConfigs := TrieMap.fromEntries<PackageName, PackageConfigV3>(highestConfigsStable.vals(), Text.equal, Text.hash);
          };
          case (#packageConfigs(packageConfigsStable)) {
            packageConfigs := TrieMap.fromEntries<PackageId, PackageConfigV3>(packageConfigsStable.vals(), Text.equal, Text.hash);
          };
        };
      },
    );

    downloadLog.setTimers<system>();

    // re-init registry
    registry := Registry.Registry(
      packageVersions,
      ownersByPackage,
      maintainersByPackage,
      highestConfigs,
      packageConfigs,
      packagePublications,
      fileIdsByPackage,
      hashByFileId,
      packageFileStats,
      packageTestStats,
      packageBenchmarks,
      packageNotes,
      packageDocsCoverage,
    );
    packagePublisher := PackagePublisher.PackagePublisher(registry, storageManager);
  };

  // SYSTEM
  stable var packagePublicationsStable : [(PackageId, PackagePublication)] = [];
  stable var packageVersionsStable : [(PackageName, [PackageVersion])] = [];
  stable var packageOwnersStable : [(PackageName, Principal)] = [];
  stable var ownersByPackageStable : [(PackageName, [Principal])] = [];
  stable var maintainersByPackageStable : [(PackageName, [Principal])] = [];

  stable var packageConfigsStableV3 : [(PackageId, PackageConfigV3)] = [];
  stable var highestConfigsStableV3 : [(PackageName, PackageConfigV3)] = [];

  stable var fileIdsByPackageStable : [(PackageId, [FileId])] = [];
  stable var hashByFileIdStable : [(FileId, Blob)] = [];
  stable var packageFileStatsStable : [(PackageId, PackageFileStats)] = [];
  stable var packageTestStatsStable : [(PackageId, TestStats)] = [];
  stable var packageBenchmarksStable : [(PackageId, Benchmarks)] = [];
  stable var packageNotesStable : [(PackageId, Text)] = [];
  stable var packageDocsCoverageStable : [(PackageId, Float)] = [];

  stable var downloadLogStable : DownloadLog.Stable = null;
  stable var storageManagerStable : StorageManager.Stable = null;
  stable var usersStable : Users.Stable = null;

  system func preupgrade() {
    packagePublicationsStable := Iter.toArray(packagePublications.entries());
    packageVersionsStable := Iter.toArray(packageVersions.entries());
    packageOwnersStable := Iter.toArray(packageOwners.entries());
    ownersByPackageStable := Iter.toArray(ownersByPackage.entries());
    maintainersByPackageStable := Iter.toArray(maintainersByPackage.entries());
    fileIdsByPackageStable := Iter.toArray(fileIdsByPackage.entries());
    hashByFileIdStable := Iter.toArray(hashByFileId.entries());
    packageFileStatsStable := Iter.toArray(packageFileStats.entries());
    packageTestStatsStable := Iter.toArray(packageTestStats.entries());
    packageBenchmarksStable := Iter.toArray(packageBenchmarks.entries());
    packageNotesStable := Iter.toArray(packageNotes.entries());
    packageDocsCoverageStable := Iter.toArray(packageDocsCoverage.entries());

    downloadLogStable := downloadLog.toStable();
    storageManagerStable := storageManager.toStable();
    usersStable := users.toStable();

    highestConfigsStableV3 := Iter.toArray(highestConfigs.entries());
    packageConfigsStableV3 := Iter.toArray(packageConfigs.entries());
  };

  system func postupgrade() {
    packageConfigs := TrieMap.fromEntries<PackageId, PackageConfigV3>(packageConfigsStableV3.vals(), Text.equal, Text.hash);
    packageConfigsStableV3 := [];

    highestConfigs := TrieMap.fromEntries<PackageName, PackageConfigV3>(highestConfigsStableV3.vals(), Text.equal, Text.hash);
    highestConfigsStableV3 := [];

    packagePublications := TrieMap.fromEntries<PackageId, PackagePublication>(packagePublicationsStable.vals(), Text.equal, Text.hash);
    packagePublicationsStable := [];

    packageVersions := TrieMap.fromEntries<PackageName, [PackageVersion]>(packageVersionsStable.vals(), Text.equal, Text.hash);
    packageVersionsStable := [];

    // migrate packageOwners -> ownersByPackage
    if (ownersByPackageStable.size() == 0) {
      ownersByPackage := packageOwnersStable.vals()
      |> Iter.map<(PackageName, Principal), (PackageName, [Principal])>(_, func((name, owner)) = (name, [owner]))
      |> TrieMap.fromEntries<PackageName, [Principal]>(_, Text.equal, Text.hash);
    } else {
      ownersByPackage := TrieMap.fromEntries<PackageName, [Principal]>(ownersByPackageStable.vals(), Text.equal, Text.hash);
      ownersByPackageStable := [];
    };

    maintainersByPackage := TrieMap.fromEntries<PackageName, [Principal]>(maintainersByPackageStable.vals(), Text.equal, Text.hash);
    maintainersByPackageStable := [];

    packageOwners := TrieMap.fromEntries<PackageName, Principal>(packageOwnersStable.vals(), Text.equal, Text.hash);
    packageOwnersStable := [];

    fileIdsByPackage := TrieMap.fromEntries<PackageId, [FileId]>(fileIdsByPackageStable.vals(), Text.equal, Text.hash);
    fileIdsByPackageStable := [];

    hashByFileId := TrieMap.fromEntries<FileId, Blob>(hashByFileIdStable.vals(), Text.equal, Text.hash);
    hashByFileIdStable := [];

    packageFileStats := TrieMap.fromEntries<PackageId, PackageFileStats>(packageFileStatsStable.vals(), Text.equal, Text.hash);
    packageFileStatsStable := [];

    packageTestStats := TrieMap.fromEntries<PackageId, TestStats>(packageTestStatsStable.vals(), Text.equal, Text.hash);
    packageTestStatsStable := [];

    packageBenchmarks := TrieMap.fromEntries<PackageId, Benchmarks>(packageBenchmarksStable.vals(), Text.equal, Text.hash);
    packageBenchmarksStable := [];

    packageNotes := TrieMap.fromEntries<PackageId, Text>(packageNotesStable.vals(), Text.equal, Text.hash);
    packageNotesStable := [];

    packageDocsCoverage := TrieMap.fromEntries<PackageId, Float>(packageDocsCoverageStable.vals(), Text.equal, Text.hash);
    packageDocsCoverageStable := [];

    downloadLog.cancelTimers();
    downloadLog.loadStable(downloadLogStable);
    downloadLog.setTimers<system>();
    downloadLogStable := null;

    storageManager.loadStable(storageManagerStable);
    storageManagerStable := null;

    users.loadStable(usersStable);
    usersStable := null;

    registry := Registry.Registry(
      packageVersions,
      ownersByPackage,
      maintainersByPackage,
      highestConfigs,
      packageConfigs,
      packagePublications,
      fileIdsByPackage,
      hashByFileId,
      packageFileStats,
      packageTestStats,
      packageBenchmarks,
      packageNotes,
      packageDocsCoverage,
    );

    packagePublisher := PackagePublisher.PackagePublisher(registry, storageManager);

    backupManager.setTimer<system>(#hours(24), _backup);
  };

  backupManager.setTimer<system>(#hours(24), _backup);
};
