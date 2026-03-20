import {
  describe,
  expect,
  test,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";

// ── network.ts pure-function tests ──────────────────────────────────────────

describe("network helpers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
    jest.resetModules();
  });

  async function loadNetwork() {
    return await import("../api/network.js");
  }

  // ── getDefaultEndpoint ────────────────────────────────────────────────

  test("getDefaultEndpoint returns ic defaults", async () => {
    const { getDefaultEndpoint } = await loadNetwork();
    expect(getDefaultEndpoint("ic")).toEqual({
      host: "https://icp-api.io",
      canisterId: "oknww-riaaa-aaaam-qaf6a-cai",
    });
  });

  test("getDefaultEndpoint returns staging defaults", async () => {
    const { getDefaultEndpoint } = await loadNetwork();
    expect(getDefaultEndpoint("staging")).toEqual({
      host: "https://icp-api.io",
      canisterId: "2d2zu-vaaaa-aaaak-qb6pq-cai",
    });
  });

  test("getDefaultEndpoint returns local defaults", async () => {
    const { getDefaultEndpoint } = await loadNetwork();
    expect(getDefaultEndpoint("local")).toEqual({
      host: "http://127.0.0.1:4943",
      canisterId: "2d2zu-vaaaa-aaaak-qb6pq-cai",
    });
  });

  test("getDefaultEndpoint ignores MOPS_REGISTRY_HOST", async () => {
    process.env["MOPS_REGISTRY_HOST"] = "http://custom:4943";
    const { getDefaultEndpoint } = await loadNetwork();
    expect(getDefaultEndpoint("ic").host).toBe("https://icp-api.io");
  });

  test("getDefaultEndpoint ignores MOPS_REGISTRY_CANISTER_ID", async () => {
    process.env["MOPS_REGISTRY_CANISTER_ID"] = "aaaaa-aa";
    const { getDefaultEndpoint } = await loadNetwork();
    expect(getDefaultEndpoint("ic").canisterId).toBe(
      "oknww-riaaa-aaaam-qaf6a-cai",
    );
  });

  // ── getEndpoint ───────────────────────────────────────────────────────

  test("getEndpoint returns defaults when no overrides", async () => {
    delete process.env["MOPS_REGISTRY_HOST"];
    delete process.env["MOPS_REGISTRY_CANISTER_ID"];
    const { getEndpoint } = await loadNetwork();
    expect(getEndpoint("ic")).toEqual({
      host: "https://icp-api.io",
      canisterId: "oknww-riaaa-aaaam-qaf6a-cai",
    });
  });

  test("getEndpoint respects MOPS_REGISTRY_HOST", async () => {
    process.env["MOPS_REGISTRY_HOST"] = "http://custom:4943";
    const { getEndpoint } = await loadNetwork();
    expect(getEndpoint("ic").host).toBe("http://custom:4943");
  });

  test("getEndpoint respects MOPS_REGISTRY_CANISTER_ID", async () => {
    process.env["MOPS_REGISTRY_CANISTER_ID"] = "aaaaa-aa";
    const { getEndpoint } = await loadNetwork();
    expect(getEndpoint("ic").canisterId).toBe("aaaaa-aa");
  });

  test("getEndpoint applies both overrides together", async () => {
    process.env["MOPS_REGISTRY_HOST"] = "http://custom:4943";
    process.env["MOPS_REGISTRY_CANISTER_ID"] = "aaaaa-aa";
    const { getEndpoint } = await loadNetwork();
    expect(getEndpoint("staging")).toEqual({
      host: "http://custom:4943",
      canisterId: "aaaaa-aa",
    });
  });

  test("getEndpoint trims whitespace from overrides", async () => {
    process.env["MOPS_REGISTRY_HOST"] = "  http://custom:4943  ";
    process.env["MOPS_REGISTRY_CANISTER_ID"] = "  aaaaa-aa  ";
    const { getEndpoint } = await loadNetwork();
    expect(getEndpoint("ic")).toEqual({
      host: "http://custom:4943",
      canisterId: "aaaaa-aa",
    });
  });

  // ── hasCustomRegistry ─────────────────────────────────────────────────

  test("hasCustomRegistry returns false when env is unset", async () => {
    delete process.env["MOPS_REGISTRY_HOST"];
    const { hasCustomRegistry } = await loadNetwork();
    expect(hasCustomRegistry()).toBe(false);
  });

  test("hasCustomRegistry returns true when env is set", async () => {
    process.env["MOPS_REGISTRY_HOST"] = "http://custom:4943";
    const { hasCustomRegistry } = await loadNetwork();
    expect(hasCustomRegistry()).toBe(true);
  });

  test("hasCustomRegistry returns false for whitespace-only value", async () => {
    process.env["MOPS_REGISTRY_HOST"] = "   ";
    const { hasCustomRegistry } = await loadNetwork();
    expect(hasCustomRegistry()).toBe(false);
  });

  // ── isRegistryFallbackEnabled ─────────────────────────────────────────

  test("isRegistryFallbackEnabled is false when neither env var is set", async () => {
    delete process.env["MOPS_REGISTRY_HOST"];
    delete process.env["MOPS_REGISTRY_FALLBACK"];
    const { isRegistryFallbackEnabled } = await loadNetwork();
    expect(isRegistryFallbackEnabled()).toBe(false);
  });

  test("isRegistryFallbackEnabled is false when only MOPS_REGISTRY_FALLBACK is set", async () => {
    delete process.env["MOPS_REGISTRY_HOST"];
    process.env["MOPS_REGISTRY_FALLBACK"] = "1";
    const { isRegistryFallbackEnabled } = await loadNetwork();
    expect(isRegistryFallbackEnabled()).toBe(false);
  });

  test("isRegistryFallbackEnabled is false when only MOPS_REGISTRY_HOST is set", async () => {
    process.env["MOPS_REGISTRY_HOST"] = "http://custom:4943";
    delete process.env["MOPS_REGISTRY_FALLBACK"];
    const { isRegistryFallbackEnabled } = await loadNetwork();
    expect(isRegistryFallbackEnabled()).toBe(false);
  });

  test("isRegistryFallbackEnabled is true when both env vars are set", async () => {
    process.env["MOPS_REGISTRY_HOST"] = "http://custom:4943";
    process.env["MOPS_REGISTRY_FALLBACK"] = "1";
    const { isRegistryFallbackEnabled } = await loadNetwork();
    expect(isRegistryFallbackEnabled()).toBe(true);
  });

  test("isRegistryFallbackEnabled accepts any truthy string", async () => {
    process.env["MOPS_REGISTRY_HOST"] = "http://custom:4943";
    for (const val of ["1", "true", "yes", "on"]) {
      process.env["MOPS_REGISTRY_FALLBACK"] = val;
      const { isRegistryFallbackEnabled } = await loadNetwork();
      expect(isRegistryFallbackEnabled()).toBe(true);
      jest.resetModules();
    }
  });

  test("isRegistryFallbackEnabled is false when MOPS_REGISTRY_FALLBACK is whitespace-only", async () => {
    process.env["MOPS_REGISTRY_HOST"] = "http://custom:4943";
    process.env["MOPS_REGISTRY_FALLBACK"] = "  ";
    const { isRegistryFallbackEnabled } = await loadNetwork();
    expect(isRegistryFallbackEnabled()).toBe(false);
  });
});

// ── registry-fallback.ts tracking tests ─────────────────────────────────────

describe("fallback package tracking", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  async function loadFallback() {
    return await import("../api/registryFallback.js");
  }

  test("packages are not marked as fallback by default", async () => {
    const fb = await loadFallback();
    fb._resetFallbackPackagesForTesting();
    expect(fb.isPackageFallback("core")).toBe(false);
  });

  test("markPackageAsFallback / isPackageFallback round-trips", async () => {
    const fb = await loadFallback();
    fb._resetFallbackPackagesForTesting();
    fb.markPackageAsFallback("core");
    expect(fb.isPackageFallback("core")).toBe(true);
    expect(fb.isPackageFallback("other")).toBe(false);
  });

  test("tracks multiple packages independently", async () => {
    const fb = await loadFallback();
    fb._resetFallbackPackagesForTesting();
    fb.markPackageAsFallback("core");
    fb.markPackageAsFallback("base");
    expect(fb.isPackageFallback("core")).toBe(true);
    expect(fb.isPackageFallback("base")).toBe(true);
    expect(fb.isPackageFallback("my-pkg")).toBe(false);
  });

  test("marking the same package twice is idempotent", async () => {
    const fb = await loadFallback();
    fb._resetFallbackPackagesForTesting();
    fb.markPackageAsFallback("core");
    fb.markPackageAsFallback("core");
    expect(fb.isPackageFallback("core")).toBe(true);
  });

  test("_resetFallbackPackagesForTesting clears all tracked packages", async () => {
    const fb = await loadFallback();
    fb.markPackageAsFallback("core");
    fb.markPackageAsFallback("base");
    fb._resetFallbackPackagesForTesting();
    expect(fb.isPackageFallback("core")).toBe(false);
    expect(fb.isPackageFallback("base")).toBe(false);
  });

  test("isFallbackActive is false without env vars", async () => {
    delete process.env["MOPS_REGISTRY_HOST"];
    delete process.env["MOPS_REGISTRY_FALLBACK"];
    const fb = await loadFallback();
    expect(fb.isFallbackActive()).toBe(false);
  });

  test("isFallbackActive is true with both env vars set", async () => {
    process.env["MOPS_REGISTRY_HOST"] = "http://custom:4943";
    process.env["MOPS_REGISTRY_FALLBACK"] = "1";
    const fb = await loadFallback();
    expect(fb.isFallbackActive()).toBe(true);
  });
});

// ── actor routing (getMainActorForPkg / getStorageActorForPkg) ──────────────

describe("actor routing", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });
  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
    jest.resetModules();
  });

  const SENTINEL_PRIMARY = { _primary: true };
  const SENTINEL_FALLBACK = { _fallback: true };
  const STORAGE_PRIMARY = { _storagePrimary: true };
  const STORAGE_FALLBACK = { _storageFallback: true };

  function mockActorsForRouting() {
    jest.unstable_mockModule("../api/actors.js", () => ({
      mainActor: jest.fn<any>().mockResolvedValue(SENTINEL_PRIMARY),
      defaultMainActor: jest.fn<any>().mockResolvedValue(SENTINEL_FALLBACK),
      storageActor: jest.fn<any>().mockResolvedValue(STORAGE_PRIMARY),
      defaultStorageActor: jest.fn<any>().mockResolvedValue(STORAGE_FALLBACK),
    }));
  }

  test("getMainActorForPkg returns primary actor for non-fallback package", async () => {
    mockActorsForRouting();
    const fb = await import("../api/registryFallback.js");
    fb._resetFallbackPackagesForTesting();

    const actor = await fb.getMainActorForPkg("my-pkg");
    expect(actor).toBe(SENTINEL_PRIMARY);
  });

  test("getMainActorForPkg returns fallback actor for marked package", async () => {
    mockActorsForRouting();
    const fb = await import("../api/registryFallback.js");
    fb._resetFallbackPackagesForTesting();
    fb.markPackageAsFallback("core");

    const actor = await fb.getMainActorForPkg("core");
    expect(actor).toBe(SENTINEL_FALLBACK);
  });

  test("getMainActorForPkg routes mixed packages correctly", async () => {
    mockActorsForRouting();
    const fb = await import("../api/registryFallback.js");
    fb._resetFallbackPackagesForTesting();
    fb.markPackageAsFallback("core");

    expect(await fb.getMainActorForPkg("my-pkg")).toBe(SENTINEL_PRIMARY);
    expect(await fb.getMainActorForPkg("core")).toBe(SENTINEL_FALLBACK);
    expect(await fb.getMainActorForPkg("another")).toBe(SENTINEL_PRIMARY);
  });

  test("getStorageActorForPkg returns primary storage for non-fallback package", async () => {
    mockActorsForRouting();
    const fb = await import("../api/registryFallback.js");
    fb._resetFallbackPackagesForTesting();

    const actor = await fb.getStorageActorForPkg("my-pkg", "aaaaa-aa" as any);
    expect(actor).toBe(STORAGE_PRIMARY);
  });

  test("getStorageActorForPkg returns fallback storage for marked package", async () => {
    mockActorsForRouting();
    const fb = await import("../api/registryFallback.js");
    fb._resetFallbackPackagesForTesting();
    fb.markPackageAsFallback("core");

    const actor = await fb.getStorageActorForPkg("core", "aaaaa-aa" as any);
    expect(actor).toBe(STORAGE_FALLBACK);
  });

  test("getStorageActorForPkg routes mixed packages correctly", async () => {
    mockActorsForRouting();
    const fb = await import("../api/registryFallback.js");
    fb._resetFallbackPackagesForTesting();
    fb.markPackageAsFallback("base");

    expect(await fb.getStorageActorForPkg("my-pkg", "aaaaa-aa" as any)).toBe(
      STORAGE_PRIMARY,
    );
    expect(await fb.getStorageActorForPkg("base", "aaaaa-aa" as any)).toBe(
      STORAGE_FALLBACK,
    );
  });
});

// ── getHighestVersion fallback integration ──────────────────────────────────

describe("getHighestVersion with fallback", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });
  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
    jest.resetModules();
  });

  function mockActors(
    primaryResult: { ok: string } | { err: string },
    fallbackResult: { ok: string } | { err: string },
  ) {
    const primaryGetHighestVersion = jest
      .fn<(pkg: string) => Promise<typeof primaryResult>>()
      .mockResolvedValue(primaryResult);
    const fallbackGetHighestVersion = jest
      .fn<(pkg: string) => Promise<typeof fallbackResult>>()
      .mockResolvedValue(fallbackResult);

    jest.unstable_mockModule("../api/actors.js", () => ({
      mainActor: jest.fn<any>().mockResolvedValue({
        getHighestVersion: primaryGetHighestVersion,
      }),
      defaultMainActor: jest.fn<any>().mockResolvedValue({
        getHighestVersion: fallbackGetHighestVersion,
      }),
      storageActor: jest.fn<any>(),
      defaultStorageActor: jest.fn<any>(),
    }));

    return { primaryGetHighestVersion, fallbackGetHighestVersion };
  }

  test("returns primary result when package is found", async () => {
    process.env["MOPS_REGISTRY_HOST"] = "http://custom:4943";
    process.env["MOPS_REGISTRY_FALLBACK"] = "1";

    const { primaryGetHighestVersion, fallbackGetHighestVersion } = mockActors(
      { ok: "1.0.0" },
      { ok: "2.0.0" },
    );

    const { getHighestVersion } = await import("../api/getHighestVersion.js");
    const result = await getHighestVersion("my-pkg");

    expect(result).toEqual({ ok: "1.0.0" });
    expect(primaryGetHighestVersion).toHaveBeenCalledWith("my-pkg");
    expect(fallbackGetHighestVersion).not.toHaveBeenCalled();
  });

  test("does not mark package as fallback when primary succeeds", async () => {
    process.env["MOPS_REGISTRY_HOST"] = "http://custom:4943";
    process.env["MOPS_REGISTRY_FALLBACK"] = "1";

    mockActors({ ok: "1.0.0" }, { ok: "2.0.0" });

    const { getHighestVersion } = await import("../api/getHighestVersion.js");
    const { isPackageFallback } = await import("../api/registryFallback.js");

    await getHighestVersion("my-pkg");
    expect(isPackageFallback("my-pkg")).toBe(false);
  });

  test("falls back to default registry when primary returns err", async () => {
    process.env["MOPS_REGISTRY_HOST"] = "http://custom:4943";
    process.env["MOPS_REGISTRY_FALLBACK"] = "1";

    const { primaryGetHighestVersion, fallbackGetHighestVersion } = mockActors(
      { err: "Package not found" },
      { ok: "2.0.0" },
    );

    const { getHighestVersion } = await import("../api/getHighestVersion.js");
    const result = await getHighestVersion("core");

    expect(result).toEqual({ ok: "2.0.0" });
    expect(primaryGetHighestVersion).toHaveBeenCalledWith("core");
    expect(fallbackGetHighestVersion).toHaveBeenCalledWith("core");
  });

  test("marks package as fallback when resolved via default registry", async () => {
    process.env["MOPS_REGISTRY_HOST"] = "http://custom:4943";
    process.env["MOPS_REGISTRY_FALLBACK"] = "1";

    mockActors({ err: "Package not found" }, { ok: "2.0.0" });

    const { getHighestVersion } = await import("../api/getHighestVersion.js");
    const { isPackageFallback } = await import("../api/registryFallback.js");

    await getHighestVersion("core");
    expect(isPackageFallback("core")).toBe(true);
  });

  test("does not fall back when MOPS_REGISTRY_FALLBACK is unset", async () => {
    process.env["MOPS_REGISTRY_HOST"] = "http://custom:4943";
    delete process.env["MOPS_REGISTRY_FALLBACK"];

    const { fallbackGetHighestVersion } = mockActors(
      { err: "Package not found" },
      { ok: "2.0.0" },
    );

    const { getHighestVersion } = await import("../api/getHighestVersion.js");
    const result = await getHighestVersion("core");

    expect(result).toEqual({ err: "Package not found" });
    expect(fallbackGetHighestVersion).not.toHaveBeenCalled();
  });

  test("returns primary error when both registries fail", async () => {
    process.env["MOPS_REGISTRY_HOST"] = "http://custom:4943";
    process.env["MOPS_REGISTRY_FALLBACK"] = "1";

    mockActors({ err: "Package not found" }, { err: "Also not found" });

    const { getHighestVersion } = await import("../api/getHighestVersion.js");
    const result = await getHighestVersion("nonexistent");

    expect(result).toEqual({ err: "Package not found" });
  });

  test("does not mark package when fallback also fails", async () => {
    process.env["MOPS_REGISTRY_HOST"] = "http://custom:4943";
    process.env["MOPS_REGISTRY_FALLBACK"] = "1";

    mockActors({ err: "Package not found" }, { err: "Also not found" });

    const { getHighestVersion } = await import("../api/getHighestVersion.js");
    const { isPackageFallback } = await import("../api/registryFallback.js");

    await getHighestVersion("nonexistent");
    expect(isPackageFallback("nonexistent")).toBe(false);
  });

  test("does not fall back when MOPS_REGISTRY_HOST is unset", async () => {
    delete process.env["MOPS_REGISTRY_HOST"];
    process.env["MOPS_REGISTRY_FALLBACK"] = "1";

    const { fallbackGetHighestVersion } = mockActors(
      { ok: "1.0.0" },
      { ok: "2.0.0" },
    );

    const { getHighestVersion } = await import("../api/getHighestVersion.js");
    const result = await getHighestVersion("my-pkg");

    expect(result).toEqual({ ok: "1.0.0" });
    expect(fallbackGetHighestVersion).not.toHaveBeenCalled();
  });
});

// ── resolveVersion fallback propagation ─────────────────────────────────────

describe("resolveVersion with fallback", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });
  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
    jest.resetModules();
  });

  function mockActorsForResolve(
    primaryResult: { ok: string } | { err: string },
    fallbackResult: { ok: string } | { err: string },
  ) {
    jest.unstable_mockModule("../api/actors.js", () => ({
      mainActor: jest.fn<any>().mockResolvedValue({
        getHighestVersion: jest.fn<any>().mockResolvedValue(primaryResult),
      }),
      defaultMainActor: jest.fn<any>().mockResolvedValue({
        getHighestVersion: jest.fn<any>().mockResolvedValue(fallbackResult),
      }),
      storageActor: jest.fn<any>(),
      defaultStorageActor: jest.fn<any>(),
    }));
  }

  test("resolveVersion returns fallback version when primary fails", async () => {
    process.env["MOPS_REGISTRY_HOST"] = "http://custom:4943";
    process.env["MOPS_REGISTRY_FALLBACK"] = "1";

    mockActorsForResolve({ err: "Package not found" }, { ok: "3.5.0" });

    const { resolveVersion } = await import("../api/resolveVersion.js");
    const version = await resolveVersion("core");
    expect(version).toBe("3.5.0");
  });

  test("resolveVersion skips lookup when version is provided", async () => {
    process.env["MOPS_REGISTRY_HOST"] = "http://custom:4943";
    process.env["MOPS_REGISTRY_FALLBACK"] = "1";

    mockActorsForResolve({ err: "Package not found" }, { ok: "3.5.0" });

    const { resolveVersion } = await import("../api/resolveVersion.js");
    const version = await resolveVersion("core", "1.2.3");
    expect(version).toBe("1.2.3");
  });

  test("resolveVersion throws when both registries fail", async () => {
    process.env["MOPS_REGISTRY_HOST"] = "http://custom:4943";
    process.env["MOPS_REGISTRY_FALLBACK"] = "1";

    mockActorsForResolve(
      { err: "Package not found" },
      { err: "Also not found" },
    );

    const { resolveVersion } = await import("../api/resolveVersion.js");
    await expect(resolveVersion("nonexistent")).rejects.toBe(
      "Package not found",
    );
  });
});

// ── getPackageFilesInfo / getFileIds actor routing ──────────────────────────

describe("download functions use correct actor per package", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });
  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
    jest.resetModules();
  });

  const MOCK_STORAGE_ID = { toText: () => "aaaaa-aa" };

  function mockActorsForDownload(options?: { failPrimary?: boolean }) {
    const primaryGetPackageDetails = jest
      .fn<(...args: any[]) => any>()
      .mockResolvedValue(
        options?.failPrimary
          ? { err: "Package not found" }
          : { ok: { publication: { storage: MOCK_STORAGE_ID } } },
      );
    const primaryGetFileIds = jest
      .fn<(...args: any[]) => any>()
      .mockResolvedValue(
        options?.failPrimary
          ? { err: "Package not found" }
          : { ok: ["file1", "file2"] },
      );
    const fallbackGetPackageDetails = jest
      .fn<(...args: any[]) => any>()
      .mockResolvedValue({
        ok: { publication: { storage: MOCK_STORAGE_ID } },
      });
    const fallbackGetFileIds = jest
      .fn<(...args: any[]) => any>()
      .mockResolvedValue({
        ok: ["file3"],
      });

    const primaryActor = {
      getPackageDetails: primaryGetPackageDetails,
      getFileIds: primaryGetFileIds,
      getHighestVersion: jest.fn<() => any>(),
    };
    const fallbackActor = {
      getPackageDetails: fallbackGetPackageDetails,
      getFileIds: fallbackGetFileIds,
      getHighestVersion: jest.fn<() => any>(),
    };

    jest.unstable_mockModule("../api/actors.js", () => ({
      mainActor: jest.fn<any>().mockResolvedValue(primaryActor),
      defaultMainActor: jest.fn<any>().mockResolvedValue(fallbackActor),
      storageActor: jest.fn<any>().mockResolvedValue({}),
      defaultStorageActor: jest.fn<any>().mockResolvedValue({}),
    }));

    return {
      primaryGetPackageDetails,
      primaryGetFileIds,
      fallbackGetPackageDetails,
      fallbackGetFileIds,
    };
  }

  test("getFileIds uses primary actor for non-fallback package", async () => {
    const mocks = mockActorsForDownload();

    const { getFileIds } = await import("../api/downloadPackageFiles.js");
    const { _resetFallbackPackagesForTesting } = await import(
      "../api/registryFallback.js"
    );
    _resetFallbackPackagesForTesting();

    const ids = await getFileIds("my-pkg", "1.0.0");
    expect(ids).toEqual(["file1", "file2"]);
    expect(mocks.primaryGetFileIds).toHaveBeenCalledWith("my-pkg", "1.0.0");
    expect(mocks.fallbackGetFileIds).not.toHaveBeenCalled();
  });

  test("getFileIds uses fallback actor for fallback package", async () => {
    const mocks = mockActorsForDownload();

    const { getFileIds } = await import("../api/downloadPackageFiles.js");
    const fb = await import("../api/registryFallback.js");
    fb._resetFallbackPackagesForTesting();
    fb.markPackageAsFallback("core");

    const ids = await getFileIds("core", "2.0.0");
    expect(ids).toEqual(["file3"]);
    expect(mocks.fallbackGetFileIds).toHaveBeenCalledWith("core", "2.0.0");
    expect(mocks.primaryGetFileIds).not.toHaveBeenCalled();
  });

  test("getPackageFilesInfo uses primary actor for non-fallback package", async () => {
    const mocks = mockActorsForDownload();

    const { getPackageFilesInfo } = await import(
      "../api/downloadPackageFiles.js"
    );
    const { _resetFallbackPackagesForTesting } = await import(
      "../api/registryFallback.js"
    );
    _resetFallbackPackagesForTesting();

    const info = await getPackageFilesInfo("my-pkg", "1.0.0");
    expect(info.storageId).toBe(MOCK_STORAGE_ID);
    expect(info.fileIds).toEqual(["file1", "file2"]);
    expect(mocks.primaryGetPackageDetails).toHaveBeenCalled();
    expect(mocks.fallbackGetPackageDetails).not.toHaveBeenCalled();
  });

  test("getPackageFilesInfo uses fallback actor for fallback package", async () => {
    const mocks = mockActorsForDownload();

    const { getPackageFilesInfo } = await import(
      "../api/downloadPackageFiles.js"
    );
    const fb = await import("../api/registryFallback.js");
    fb._resetFallbackPackagesForTesting();
    fb.markPackageAsFallback("core");

    const info = await getPackageFilesInfo("core", "2.0.0");
    expect(info.storageId).toBe(MOCK_STORAGE_ID);
    expect(info.fileIds).toEqual(["file3"]);
    expect(mocks.fallbackGetPackageDetails).toHaveBeenCalled();
    expect(mocks.primaryGetPackageDetails).not.toHaveBeenCalled();
  });
});

// ── end-to-end: two-package scenario ────────────────────────────────────────

describe("mixed registry scenario", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });
  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
    jest.resetModules();
  });

  test("local package resolves on primary, transitive dep falls back", async () => {
    process.env["MOPS_REGISTRY_HOST"] = "http://custom:4943";
    process.env["MOPS_REGISTRY_FALLBACK"] = "1";

    const primaryGetHighestVersion = jest
      .fn<(pkg: string) => any>()
      .mockImplementation((pkg: string) => {
        if (pkg === "caffeine-ui") {
          return Promise.resolve({ ok: "1.0.0" });
        }
        return Promise.resolve({ err: `Package '${pkg}' not found` });
      });
    const fallbackGetHighestVersion = jest
      .fn<(pkg: string) => any>()
      .mockImplementation((pkg: string) => {
        if (pkg === "core") {
          return Promise.resolve({ ok: "5.0.0" });
        }
        return Promise.resolve({ err: `Package '${pkg}' not found` });
      });

    jest.unstable_mockModule("../api/actors.js", () => ({
      mainActor: jest.fn<any>().mockResolvedValue({
        getHighestVersion: primaryGetHighestVersion,
      }),
      defaultMainActor: jest.fn<any>().mockResolvedValue({
        getHighestVersion: fallbackGetHighestVersion,
      }),
      storageActor: jest.fn<any>(),
      defaultStorageActor: jest.fn<any>(),
    }));

    const { getHighestVersion } = await import("../api/getHighestVersion.js");
    const { isPackageFallback } = await import("../api/registryFallback.js");

    const localResult = await getHighestVersion("caffeine-ui");
    expect(localResult).toEqual({ ok: "1.0.0" });
    expect(isPackageFallback("caffeine-ui")).toBe(false);

    const transitiveResult = await getHighestVersion("core");
    expect(transitiveResult).toEqual({ ok: "5.0.0" });
    expect(isPackageFallback("core")).toBe(true);

    const missingResult = await getHighestVersion("nonexistent");
    expect(missingResult).toEqual({ err: "Package 'nonexistent' not found" });
    expect(isPackageFallback("nonexistent")).toBe(false);
  });
});
