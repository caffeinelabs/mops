import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";

import { downloadAndExtract } from "../commands/toolchain/toolchain-utils";
import {
  resolvesToX64Darwin,
  x64DarwinMissingBuildHint,
} from "../commands/toolchain/platform-support";

// No CI runner is macOS, so the x86_64-darwin branch is unreachable from the
// real globals. The helpers take platform/arch as parameters for that reason.
describe("resolvesToX64Darwin", () => {
  test("is true only for darwin on a non-arm arch", () => {
    expect(resolvesToX64Darwin("darwin", "x64")).toBe(true);
    expect(resolvesToX64Darwin("darwin", "arm64")).toBe(false);
    expect(resolvesToX64Darwin("linux", "x64")).toBe(false);
    expect(resolvesToX64Darwin("linux", "arm64")).toBe(false);
    expect(resolvesToX64Darwin("win32", "x64")).toBe(false);
  });
});

describe("x64DarwinMissingBuildHint", () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(
    process,
    "platform",
  )!;
  const originalArch = Object.getOwnPropertyDescriptor(process, "arch")!;

  const runningOn = (platform: string, arch: string) => {
    Object.defineProperty(process, "platform", { value: platform });
    Object.defineProperty(process, "arch", { value: arch });
  };

  afterEach(() => {
    Object.defineProperty(process, "platform", originalPlatform);
    Object.defineProperty(process, "arch", originalArch);
  });

  const hint = () =>
    x64DarwinMissingBuildHint({
      tool: "moc",
      version: "1.17.0",
      url: "https://example.test/motoko-Darwin-x86_64-1.17.0.tar.gz",
      reason: "Motoko has dropped its Intel-Mac release leg.",
      alternative: 'Set moc = "./tools/moc" in [toolchain] to use it.',
    });

  test("names the tool, the missing asset and a way out", () => {
    runningOn("darwin", "x64");
    let message = hint()!;
    expect(message).toContain("moc 1.17.0 has no Intel-Mac build");
    expect(message).toContain("motoko-Darwin-x86_64-1.17.0.tar.gz");
    expect(message).toContain("Motoko has dropped its Intel-Mac release leg.");
    expect(message).toContain('Set moc = "./tools/moc" in [toolchain]');
  });

  // An x64 Node under Rosetta on Apple Silicon lands here too, so the message
  // must not claim the hardware is Intel.
  test("says what mops resolved, not what the hardware is", () => {
    runningOn("darwin", "x64");
    let message = hint()!;
    expect(message).toContain("resolved this process as x86_64-darwin");
    expect(message).not.toMatch(/your Mac is Intel/i);
    expect(message).toContain("run mops under an arm64 Node.js");
  });

  test("returns undefined on every other platform", () => {
    runningOn("darwin", "arm64");
    expect(hint()).toBeUndefined();
    runningOn("linux", "x64");
    expect(hint()).toBeUndefined();
    runningOn("linux", "arm64");
    expect(hint()).toBeUndefined();
  });
});

describe("downloadAndExtract missing-asset hint", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const stubFetch = (status: number) => {
    globalThis.fetch = jest.fn(
      async () => ({ status, ok: status === 200 }) as unknown as Response,
    );
  };

  const call = (missingAssetHint?: () => string | undefined) =>
    downloadAndExtract(
      "https://example.test/motoko-Darwin-x86_64-1.17.0.tar.gz",
      "/tmp/mops-hint-test",
      "",
      { missingAssetHint },
    );

  test("uses the hint on a 404", async () => {
    stubFetch(404);
    await expect(call(() => "hint: no Intel-Mac build")).rejects.toThrow(
      "hint: no Intel-Mac build",
    );
  });

  test("falls back to the generic message when the hint declines", async () => {
    stubFetch(404);
    await expect(call(() => undefined)).rejects.toThrow(/ERROR 404/);
  });

  // A 403 or 500 is not a dropped asset — the platform story would be a lie.
  test("never consults the hint for a non-404", async () => {
    stubFetch(500);
    let missingAssetHint = jest.fn(() => "should not be used");
    await expect(call(missingAssetHint)).rejects.toThrow(/ERROR 500/);
    expect(missingAssetHint).not.toHaveBeenCalled();
  });

  test("keeps the generic 404 message when no hint is supplied", async () => {
    stubFetch(404);
    await expect(call()).rejects.toThrow(/ERROR 404/);
  });
});
