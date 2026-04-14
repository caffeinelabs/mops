export const idlFactory = ({ IDL }) => {
  const PackageName = IDL.Text;
  const Result_3 = IDL.Variant({ 'ok' : IDL.Null, 'err' : IDL.Text });
  const PublishingId = IDL.Text;
  const Err = IDL.Text;
  const Result = IDL.Variant({ 'ok' : IDL.Null, 'err' : Err });
  const Text = IDL.Text;
  const PackageVersion = IDL.Text;
  const PackageId = IDL.Text;
  const Time = IDL.Int;
  const DownloadsSnapshot = IDL.Record({
    'startTime' : Time,
    'endTime' : Time,
    'downloads' : IDL.Nat,
  });
  const FileId = IDL.Text;
  const Result_8 = IDL.Variant({
    'ok' : IDL.Vec(IDL.Tuple(FileId, IDL.Vec(IDL.Nat8))),
    'err' : Err,
  });
  const Result_7 = IDL.Variant({ 'ok' : IDL.Vec(FileId), 'err' : Err });
  const SemverPart = IDL.Variant({
    'major' : IDL.Null,
    'minor' : IDL.Null,
    'patch' : IDL.Null,
  });
  const Result_6 = IDL.Variant({
    'ok' : IDL.Vec(IDL.Tuple(PackageName, PackageVersion)),
    'err' : Err,
  });
  const Result_5 = IDL.Variant({ 'ok' : PackageVersion, 'err' : Err });
  const User = IDL.Record({
    'id' : IDL.Principal,
    'emailVerified' : IDL.Bool,
    'twitter' : IDL.Text,
    'displayName' : IDL.Text,
    'name' : IDL.Text,
    'site' : IDL.Text,
    'email' : IDL.Text,
    'twitterVerified' : IDL.Bool,
    'githubVerified' : IDL.Bool,
    'github' : IDL.Text,
  });
  const DepsStatus = IDL.Variant({
    'allLatest' : IDL.Null,
    'tooOld' : IDL.Null,
    'updatesAvailable' : IDL.Null,
  });
  const PackageQuality = IDL.Record({
    'depsStatus' : DepsStatus,
    'docsCoverage' : IDL.Float64,
    'hasDescription' : IDL.Bool,
    'hasKeywords' : IDL.Bool,
    'hasLicense' : IDL.Bool,
    'hasDocumentation' : IDL.Bool,
    'hasTests' : IDL.Bool,
    'hasRepository' : IDL.Bool,
    'hasReleaseNotes' : IDL.Bool,
  });
  const Script = IDL.Record({ 'value' : IDL.Text, 'name' : IDL.Text });
  const DependencyV2 = IDL.Record({
    'name' : PackageName,
    'repo' : IDL.Text,
    'version' : IDL.Text,
  });
  const Requirement = IDL.Record({ 'value' : IDL.Text, 'name' : IDL.Text });
  const PackageConfigV3 = IDL.Record({
    'dfx' : IDL.Text,
    'moc' : IDL.Text,
    'scripts' : IDL.Vec(Script),
    'baseDir' : IDL.Text,
    'documentation' : IDL.Text,
    'name' : PackageName,
    'homepage' : IDL.Text,
    'description' : IDL.Text,
    'version' : IDL.Text,
    'keywords' : IDL.Vec(IDL.Text),
    'donation' : IDL.Text,
    'devDependencies' : IDL.Vec(DependencyV2),
    'repository' : IDL.Text,
    'dependencies' : IDL.Vec(DependencyV2),
    'requirements' : IDL.Vec(Requirement),
    'license' : IDL.Text,
    'readme' : IDL.Text,
  });
  const PackagePublication = IDL.Record({
    'storage' : IDL.Principal,
    'time' : Time,
    'user' : IDL.Principal,
  });
  const PackageSummary = IDL.Record({
    'ownerInfo' : User,
    'owners' : IDL.Vec(User),
    'maintainers' : IDL.Vec(User),
    'owner' : IDL.Principal,
    'depAlias' : IDL.Text,
    'quality' : PackageQuality,
    'publisher' : User,
    'highestVersion' : PackageVersion,
    'downloadsTotal' : IDL.Nat,
    'downloadsInLast30Days' : IDL.Nat,
    'downloadsInLast7Days' : IDL.Nat,
    'config' : PackageConfigV3,
    'publication' : PackagePublication,
  });
  const BenchmarkMetric = IDL.Text;
  const Benchmark = IDL.Record({
    'gc' : IDL.Text,
    'metrics' : IDL.Vec(IDL.Tuple(BenchmarkMetric, IDL.Vec(IDL.Vec(IDL.Int)))),
    'cols' : IDL.Vec(IDL.Text),
    'file' : IDL.Text,
    'name' : IDL.Text,
    'rows' : IDL.Vec(IDL.Text),
    'description' : IDL.Text,
    'compilerVersion' : IDL.Text,
    'compiler' : IDL.Text,
    'replica' : IDL.Text,
    'replicaVersion' : IDL.Text,
    'forceGC' : IDL.Bool,
  });
  const Benchmarks = IDL.Vec(Benchmark);
  const TestStats = IDL.Record({
    'passedNames' : IDL.Vec(IDL.Text),
    'passed' : IDL.Nat,
  });
  const PackageFileStatsPublic = IDL.Record({
    'sourceFiles' : IDL.Nat,
    'sourceSize' : IDL.Nat,
  });
  const TestsChanges = IDL.Record({
    'addedNames' : IDL.Vec(IDL.Text),
    'removedNames' : IDL.Vec(IDL.Text),
  });
  const DepChange = IDL.Record({
    'oldVersion' : IDL.Text,
    'name' : IDL.Text,
    'newVersion' : IDL.Text,
  });
  const PackageChanges = IDL.Record({
    'tests' : TestsChanges,
    'deps' : IDL.Vec(DepChange),
    'curBenchmarks' : Benchmarks,
    'prevDocsCoverage' : IDL.Float64,
    'prevBenchmarks' : Benchmarks,
    'notes' : IDL.Text,
    'curDocsCoverage' : IDL.Float64,
    'devDeps' : IDL.Vec(DepChange),
  });
  const PackageSummaryWithChanges = IDL.Record({
    'ownerInfo' : User,
    'owners' : IDL.Vec(User),
    'maintainers' : IDL.Vec(User),
    'owner' : IDL.Principal,
    'depAlias' : IDL.Text,
    'quality' : PackageQuality,
    'publisher' : User,
    'highestVersion' : PackageVersion,
    'downloadsTotal' : IDL.Nat,
    'downloadsInLast30Days' : IDL.Nat,
    'downloadsInLast7Days' : IDL.Nat,
    'config' : PackageConfigV3,
    'changes' : PackageChanges,
    'publication' : PackagePublication,
  });
  const PackageDetails = IDL.Record({
    'benchmarks' : Benchmarks,
    'ownerInfo' : User,
    'owners' : IDL.Vec(User),
    'maintainers' : IDL.Vec(User),
    'owner' : IDL.Principal,
    'depAlias' : IDL.Text,
    'deps' : IDL.Vec(PackageSummary),
    'quality' : PackageQuality,
    'publisher' : User,
    'testStats' : TestStats,
    'docsCoverage' : IDL.Float64,
    'highestVersion' : PackageVersion,
    'downloadsTotal' : IDL.Nat,
    'downloadsInLast30Days' : IDL.Nat,
    'dependentsCount' : IDL.Nat,
    'downloadTrend' : IDL.Vec(DownloadsSnapshot),
    'fileStats' : PackageFileStatsPublic,
    'versionHistory' : IDL.Vec(PackageSummaryWithChanges),
    'dependents' : IDL.Vec(PackageSummary),
    'devDeps' : IDL.Vec(PackageSummary),
    'downloadsInLast7Days' : IDL.Nat,
    'config' : PackageConfigV3,
    'changes' : PackageChanges,
    'versions' : IDL.Vec(PackageVersion),
    'publication' : PackagePublication,
  });
  const Result_4 = IDL.Variant({ 'ok' : PackageDetails, 'err' : Err });
  const StorageId = IDL.Principal;
  const StorageStats = IDL.Record({
    'fileCount' : IDL.Nat,
    'cyclesBalance' : IDL.Nat,
    'memorySize' : IDL.Nat,
  });
  const Header = IDL.Tuple(IDL.Text, IDL.Text);
  const Request = IDL.Record({
    'url' : IDL.Text,
    'method' : IDL.Text,
    'body' : IDL.Vec(IDL.Nat8),
    'headers' : IDL.Vec(Header),
    'certificate_version' : IDL.Opt(IDL.Nat16),
  });
  const StreamingToken = IDL.Vec(IDL.Nat8);
  const StreamingCallbackResponse = IDL.Record({
    'token' : IDL.Opt(StreamingToken),
    'body' : IDL.Vec(IDL.Nat8),
  });
  const StreamingCallback = IDL.Func(
      [StreamingToken],
      [IDL.Opt(StreamingCallbackResponse)],
      ['query'],
    );
  const StreamingStrategy = IDL.Variant({
    'Callback' : IDL.Record({
      'token' : StreamingToken,
      'callback' : StreamingCallback,
    }),
  });
  const Response = IDL.Record({
    'body' : IDL.Vec(IDL.Nat8),
    'headers' : IDL.Vec(Header),
    'upgrade' : IDL.Opt(IDL.Bool),
    'streaming_strategy' : IDL.Opt(StreamingStrategy),
    'status_code' : IDL.Nat16,
  });
  const PageCount = IDL.Nat;
  const Result_2 = IDL.Variant({ 'ok' : FileId, 'err' : Err });
  const PackageConfigV3_Publishing = IDL.Record({
    'dfx' : IDL.Text,
    'moc' : IDL.Text,
    'scripts' : IDL.Vec(Script),
    'baseDir' : IDL.Text,
    'documentation' : IDL.Text,
    'name' : PackageName,
    'homepage' : IDL.Text,
    'description' : IDL.Text,
    'version' : IDL.Text,
    'keywords' : IDL.Vec(IDL.Text),
    'donation' : IDL.Text,
    'devDependencies' : IDL.Vec(DependencyV2),
    'repository' : IDL.Text,
    'dependencies' : IDL.Vec(DependencyV2),
    'requirements' : IDL.Opt(IDL.Vec(Requirement)),
    'license' : IDL.Text,
    'readme' : IDL.Text,
  });
  const Result_1 = IDL.Variant({ 'ok' : PublishingId, 'err' : Err });
  const HttpHeader = IDL.Record({ 'value' : IDL.Text, 'name' : IDL.Text });
  const HttpRequestResult = IDL.Record({
    'status' : IDL.Nat,
    'body' : IDL.Vec(IDL.Nat8),
    'headers' : IDL.Vec(HttpHeader),
  });
  const TransformArg = IDL.Record({
    'context' : IDL.Vec(IDL.Nat8),
    'response' : HttpRequestResult,
  });
  const Main = IDL.Service({
    'addMaintainer' : IDL.Func([PackageName, IDL.Principal], [Result_3], []),
    'addOwner' : IDL.Func([PackageName, IDL.Principal], [Result_3], []),
    'backup' : IDL.Func([], [], []),
    'computeHashesForExistingFiles' : IDL.Func([], [], []),
    'finishPublish' : IDL.Func([PublishingId], [Result], []),
    'getApiVersion' : IDL.Func([], [Text], ['query']),
    'getBackupCanisterId' : IDL.Func([], [IDL.Principal], ['query']),
    'getDefaultPackages' : IDL.Func(
        [IDL.Text],
        [IDL.Vec(IDL.Tuple(PackageName, PackageVersion))],
        ['query'],
      ),
    'getDownloadTrendByPackageId' : IDL.Func(
        [PackageId],
        [IDL.Vec(DownloadsSnapshot)],
        ['query'],
      ),
    'getDownloadTrendByPackageName' : IDL.Func(
        [PackageName],
        [IDL.Vec(DownloadsSnapshot)],
        ['query'],
      ),
    'getFileHashes' : IDL.Func([PackageName, PackageVersion], [Result_8], []),
    'getFileHashesByPackageIds' : IDL.Func(
        [IDL.Vec(PackageId)],
        [
          IDL.Vec(
            IDL.Tuple(PackageId, IDL.Vec(IDL.Tuple(FileId, IDL.Vec(IDL.Nat8))))
          ),
        ],
        [],
      ),
    'getFileHashesQuery' : IDL.Func(
        [PackageName, PackageVersion],
        [Result_8],
        ['query'],
      ),
    'getFileIds' : IDL.Func(
        [PackageName, PackageVersion],
        [Result_7],
        ['query'],
      ),
    'getHighestSemverBatch' : IDL.Func(
        [IDL.Vec(IDL.Tuple(PackageName, PackageVersion, SemverPart))],
        [Result_6],
        ['query'],
      ),
    'getHighestVersion' : IDL.Func([PackageName], [Result_5], ['query']),
    'getMostDownloadedPackages' : IDL.Func(
        [],
        [IDL.Vec(PackageSummary)],
        ['query'],
      ),
    'getMostDownloadedPackagesIn7Days' : IDL.Func(
        [],
        [IDL.Vec(PackageSummary)],
        ['query'],
      ),
    'getNewPackages' : IDL.Func([], [IDL.Vec(PackageSummary)], ['query']),
    'getPackageDependents' : IDL.Func(
        [PackageName, IDL.Nat, IDL.Nat],
        [IDL.Vec(PackageSummary), IDL.Nat],
        ['query'],
      ),
    'getPackageDetails' : IDL.Func(
        [PackageName, PackageVersion],
        [Result_4],
        ['query'],
      ),
    'getPackageMaintainers' : IDL.Func(
        [PackageName],
        [IDL.Vec(IDL.Principal)],
        ['query'],
      ),
    'getPackageOwners' : IDL.Func(
        [PackageName],
        [IDL.Vec(IDL.Principal)],
        ['query'],
      ),
    'getPackageVersionHistory' : IDL.Func(
        [PackageName],
        [IDL.Vec(PackageSummaryWithChanges)],
        ['query'],
      ),
    'getPackagesByCategory' : IDL.Func(
        [],
        [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Vec(PackageSummary)))],
        ['query'],
      ),
    'getRecentlyUpdatedPackages' : IDL.Func(
        [],
        [IDL.Vec(PackageSummaryWithChanges)],
        ['query'],
      ),
    'getStoragesStats' : IDL.Func(
        [],
        [IDL.Vec(IDL.Tuple(StorageId, StorageStats))],
        ['query'],
      ),
    'getTotalDownloads' : IDL.Func([], [IDL.Nat], ['query']),
    'getTotalPackages' : IDL.Func([], [IDL.Nat], ['query']),
    'getUser' : IDL.Func([IDL.Principal], [IDL.Opt(User)], ['query']),
    'http_request' : IDL.Func([Request], [Response], ['query']),
    'notifyInstall' : IDL.Func([PackageName, PackageVersion], [], ['oneway']),
    'notifyInstalls' : IDL.Func(
        [IDL.Vec(IDL.Tuple(PackageName, PackageVersion))],
        [],
        ['oneway'],
      ),
    'removeMaintainer' : IDL.Func([PackageName, IDL.Principal], [Result_3], []),
    'removeOwner' : IDL.Func([PackageName, IDL.Principal], [Result_3], []),
    'restore' : IDL.Func([IDL.Nat], [], []),
    'search' : IDL.Func(
        [Text, IDL.Opt(IDL.Nat), IDL.Opt(IDL.Nat)],
        [IDL.Vec(PackageSummary), PageCount],
        ['query'],
      ),
    'setStorageControllers' : IDL.Func([], [], []),
    'setUserProp' : IDL.Func([IDL.Text, IDL.Text], [Result_3], []),
    'startFileUpload' : IDL.Func(
        [PublishingId, Text, IDL.Nat, IDL.Vec(IDL.Nat8)],
        [Result_2],
        [],
      ),
    'startPublish' : IDL.Func([PackageConfigV3_Publishing], [Result_1], []),
    'takeSnapshotsIfNeeded' : IDL.Func([], [], []),
    'transformRequest' : IDL.Func(
        [TransformArg],
        [HttpRequestResult],
        ['query'],
      ),
    'uploadBenchmarks' : IDL.Func([PublishingId, Benchmarks], [Result], []),
    'uploadDocsCoverage' : IDL.Func([PublishingId, IDL.Float64], [Result], []),
    'uploadFileChunk' : IDL.Func(
        [PublishingId, FileId, IDL.Nat, IDL.Vec(IDL.Nat8)],
        [Result],
        [],
      ),
    'uploadNotes' : IDL.Func([PublishingId, IDL.Text], [Result], []),
    'uploadTestStats' : IDL.Func([PublishingId, TestStats], [Result], []),
  });
  return Main;
};
export const init = ({ IDL }) => { return []; };
