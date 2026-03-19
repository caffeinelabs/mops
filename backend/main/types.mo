import Time "mo:base/Time";

module {
  public type PackageName = Text; // lib
  public type PackageVersion = Text; // 1.2.3
  public type PackageId = Text; // lib@1.2.3
  public type AliasVersion = Text; // x.y.z or x.y or x or empty
  public type FileId = Text; // <pkg>@<ver>/<path>
  public type Err = Text;

  public type SemverPart = {
    #major;
    #minor;
    #patch;
  };

  public type User = {
    id : Principal;
    name : Text; // max 30 (e.g. "zen")
    displayName : Text; // max 30 (e.g. "Zen Voich")
    site : Text; // max 100 (e.g. "https://dfinity.org")
    email : Text; // max 50 (e.g. "zen.voich@gmail.com")
    github : Text; // max 30 (e.g. "ZenVoich")
    twitter : Text; // max 30 (e.g. "mops_one")
    emailVerified : Bool; // unused
    twitterVerified : Bool; // unused
    githubVerified : Bool; // unused
  };

  public type Access = {
    #readOnly;
    #readWrite;
  };

  public type Permission = {
    user : Principal;
    access : Access;
  };

  public type Script = {
    name : Text; // max 50
    value : Text; // max 200
  };

  public type PackagePublication = {
    time : Time.Time;
    user : Principal; // TODO: userId?
    storage : Principal;
  };

  public type DependencyV2 = {
    name : PackageName; // max 50
    repo : Text; // max 300
    version : Text; // max 20
  };

  public type Requirement = {
    name : Text; // moc
    value : Text; // version for moc
  };

  public type PackageConfigV2 = {
    name : PackageName; // max 50
    version : Text; // max 20
    description : Text; // max 200
    repository : Text; // max 300
    keywords : [Text]; // max 5 items, max 20 chars
    baseDir : Text; // max 50
    readme : Text; // max 100
    license : Text; // max 30
    dependencies : [DependencyV2]; // max 100 items
    devDependencies : [DependencyV2]; // max 100 items
    // legacy for backward compatibility
    documentation : Text; // max 300
    homepage : Text; // max 300
    donation : Text; // empty or 64 chars
    scripts : [Script]; // max 40 items
    dfx : Text; // max 10
    moc : Text; // max 10
  };

  // legacy for backward compatibility
  public type PackageConfigV3_Publishing = PackageConfigV2 and {
    requirements : ?[Requirement]; // max 1 item
  };

  public type PackageConfigV3 = PackageConfigV2 and {
    requirements : [Requirement]; // max 1 item
  };

  public type PackageSummary = {
    owner : Principal; // legacy
    ownerInfo : User; // legacy
    owners : [User];
    maintainers : [User];
    config : PackageConfigV3;
    publication : PackagePublication;
    publisher : User;
    downloadsTotal : Nat;
    downloadsInLast30Days : Nat;
    downloadsInLast7Days : Nat;
    quality : PackageQuality;
    depAlias : Text; // dep alias (e.g. "lib@1" or "lib")
    highestVersion : PackageVersion;
  };

  public type PackageSummaryWithChanges = PackageSummary and {
    changes : PackageChanges;
  };

  public type PackageDetails = PackageSummaryWithChanges and {
    versions : [PackageVersion];
    versionHistory : [PackageSummaryWithChanges]; // limited to 5
    deps : [PackageSummary];
    devDeps : [PackageSummary];
    dependentsCount : Nat;
    dependents : [PackageSummary]; // limited to 10
    downloadTrend : [DownloadsSnapshot];
    fileStats : PackageFileStatsPublic;
    testStats : TestStats;
    benchmarks : Benchmarks;
    docsCoverage : Float;
  };

  public type DownloadsSnapshot = {
    startTime : Time.Time;
    endTime : Time.Time;
    downloads : Nat;
  };

  public type PackageFileStats = {
    sourceFiles : Nat;
    sourceSize : Nat;
    docsCount : Nat; // always 1
    docsSize : Nat;
    testFiles : Nat; // unused
    testSize : Nat; // unused
    benchFiles : Nat; // unused
    benchSize : Nat; // unused
  };

  public type PackageFileStatsPublic = {
    sourceFiles : Nat;
    sourceSize : Nat;
  };

  public type TestStats = {
    passed : Nat;
    passedNames : [Text];
  };

  public type TestsChanges = {
    addedNames : [Text];
    removedNames : [Text];
  };

  public type DepChange = {
    name : Text;
    oldVersion : Text;
    newVersion : Text;
  };

  public type PackageChanges = {
    notes : Text;
    tests : TestsChanges;
    deps : [DepChange];
    devDeps : [DepChange];
    curBenchmarks : Benchmarks;
    prevBenchmarks : Benchmarks;
    prevDocsCoverage : Float;
    curDocsCoverage : Float;
  };

  public type PackageQuality = {
    // dynamic
    depsStatus : DepsStatus;
    // base
    hasDescription : Bool;
    hasKeywords : Bool;
    hasLicense : Bool;
    hasRepository : Bool;
    hasDocumentation : Bool; // legacy
    docsCoverage : Float;
    // extra
    hasTests : Bool;
    hasReleaseNotes : Bool;
  };

  public type DepsStatus = {
    #allLatest;
    #updatesAvailable;
    #tooOld;
  };

  public type Benchmarks = [Benchmark];

  type BenchmarkMetric = Text; // instructions, rts_heap_size, rts_logical_stable_memory_size, rts_reclaimed

  public type Benchmark = {
    file : Text;
    name : Text;
    description : Text;
    rows : [Text];
    cols : [Text];
    compiler : Text;
    compilerVersion : Text;
    replica : Text;
    replicaVersion : Text;
    gc : Text; // copying, compacting, generational, incremental
    forceGC : Bool;
    metrics : [(BenchmarkMetric, [[Int]])];
  };
};
