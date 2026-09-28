import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Host } from "../commands/toolchain/toolchain-utils";

const macArm: Host = { os: "darwin", arch: "aarch64" };
const macIntel: Host = { os: "darwin", arch: "x86_64" };
const linuxIntel: Host = { os: "linux", arch: "x86_64" };

const MACH_O_X86_64 = 0x01000007;
const MACH_O_ARM64 = 0x0100000c;

describe("pocket-ic cache", () => {
  let pocketIc: typeof import("../commands/toolchain/pocket-ic.js");
  let cacheHome: string;
  let cacheHomeBefore = process.env.XDG_CACHE_HOME;

  // A Mach-O header with the given CPU type, or a script when none is given.
  let cacheBinary = (version: string, cpu?: number) => {
    let bin = path.join(cacheHome, "mops", "pocket-ic", version, "pocket-ic");
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    let header = Buffer.alloc(64);
    if (cpu === undefined) {
      header.write("#!/bin/sh\n");
    } else {
      header.writeUInt32LE(0xfeedfacf, 0);
      header.writeUInt32LE(cpu, 4);
    }
    fs.writeFileSync(bin, header);
  };

  beforeAll(async () => {
    // `globalCacheDir` is read at import time, so the override has to be set
    // before the module under test is loaded.
    cacheHome = fs.mkdtempSync(path.join(os.tmpdir(), "mops-pocket-ic-"));
    process.env.XDG_CACHE_HOME = cacheHome;
    pocketIc = await import("../commands/toolchain/pocket-ic.js");
  });

  afterAll(() => {
    if (cacheHomeBefore === undefined) {
      delete process.env.XDG_CACHE_HOME;
    } else {
      process.env.XDG_CACHE_HOME = cacheHomeBefore;
    }
    fs.rmSync(cacheHome, { recursive: true, force: true });
  });

  test("a build for another CPU is stale", () => {
    cacheBinary("15.0.0", MACH_O_X86_64);
    expect(pocketIc.isCached("15.0.0", macArm)).toBe(false);
    expect(pocketIc.isCached("15.0.0", macIntel)).toBe(true);

    cacheBinary("15.0.0", MACH_O_ARM64);
    expect(pocketIc.isCached("15.0.0", macArm)).toBe(true);
    expect(pocketIc.isCached("15.0.0", linuxIntel)).toBe(false);
  });

  test("x86_64 is current where the release has no arm64 build", () => {
    cacheBinary("9.0.1", MACH_O_X86_64);
    expect(pocketIc.isCached("9.0.1", macArm)).toBe(true);
  });

  test("missing and unrecognised binaries", () => {
    expect(pocketIc.isCached("14.0.0", macArm)).toBe(false);
    cacheBinary("14.0.0");
    expect(pocketIc.isCached("14.0.0", macArm)).toBe(true);
  });

  test("a pin that is not a release version is refused before download", async () => {
    await expect(pocketIc.download("latest")).rejects.toThrow(
      'pocket-ic "latest" is not a release version.',
    );
  });
});
