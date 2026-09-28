import { afterAll, describe, expect, test } from "@jest/globals";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CliError } from "../error";
import {
  executableArch,
  hostTarget,
  installVersion,
  type Host,
} from "../commands/toolchain/toolchain-utils";
import * as moc from "../commands/toolchain/moc";
import * as pocketIc from "../commands/toolchain/pocket-ic";
import * as lintoko from "../commands/toolchain/lintoko";
import * as moFmt from "../commands/toolchain/mo-fmt";
import * as wasmtime from "../commands/toolchain/wasmtime";
import * as wasmOpt from "../commands/toolchain/wasm-opt";

const macArm: Host = { os: "darwin", arch: "aarch64" };
const macIntel: Host = { os: "darwin", arch: "x86_64" };
const linuxArm: Host = { os: "linux", arch: "aarch64" };
const linuxIntel: Host = { os: "linux", arch: "x86_64" };

let asset = (url: string) => url.slice(url.lastIndexOf("/") + 1);

describe("hostTarget", () => {
  test("maps Node's platform and arch", () => {
    expect(hostTarget("t", { platform: "darwin", arch: "arm64" })).toEqual(
      macArm,
    );
    expect(hostTarget("t", { platform: "linux", arch: "x64" })).toEqual(
      linuxIntel,
    );
  });

  test("refuses hosts no tool has a build for", () => {
    expect(() => hostTarget("moc", { platform: "win32", arch: "x64" })).toThrow(
      new CliError("moc has no Windows build. Please use WSL."),
    );
    expect(() =>
      hostTarget("moc", { platform: "freebsd", arch: "x64" }),
    ).toThrow("moc has no freebsd build.");
    // 32-bit arm cannot run the aarch64 build.
    expect(() => hostTarget("moc", { platform: "linux", arch: "arm" })).toThrow(
      "moc has no arm build.",
    );
    expect(() =>
      hostTarget("mo-fmt", {
        platform: "win32",
        arch: "x64",
        hint: "Unpin it.",
      }),
    ).toThrow("mo-fmt has no Windows build. Unpin it.");
  });
});

describe("executableArch", () => {
  let dir = fs.mkdtempSync(path.join(os.tmpdir(), "mops-arch-"));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  let withHeader = (name: string, write: (b: Buffer) => void) => {
    let header = Buffer.alloc(64);
    write(header);
    let file = path.join(dir, name);
    fs.writeFileSync(file, header);
    return file;
  };
  let machO = (cpu: number) => (b: Buffer) => {
    b.writeUInt32LE(0xfeedfacf, 0);
    b.writeUInt32LE(cpu, 4);
  };
  let elf = (machine: number) => (b: Buffer) => {
    b.writeUInt32BE(0x7f454c46, 0);
    b.writeUInt16LE(machine, 18);
  };

  test("reads Mach-O and ELF headers", () => {
    expect(executableArch(withHeader("mx", machO(0x01000007)))).toBe("x86_64");
    expect(executableArch(withHeader("ma", machO(0x0100000c)))).toBe("aarch64");
    expect(executableArch(withHeader("ex", elf(0x3e)))).toBe("x86_64");
    expect(executableArch(withHeader("ea", elf(0xb7)))).toBe("aarch64");
    expect(
      executableArch(withHeader("sh", (b) => b.write("#!/bin/sh\n"))),
    ).toBeUndefined();
  });
});

describe("installVersion", () => {
  let dir = fs.mkdtempSync(path.join(os.tmpdir(), "mops-install-"));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  // A stale binary is still a working one until its replacement has landed.
  test("keeps the existing install when populate fails", async () => {
    let destDir = path.join(dir, "1.0.0");
    fs.mkdirSync(destDir);
    fs.writeFileSync(path.join(destDir, "bin"), "stale");
    await expect(
      installVersion(destDir, {
        label: "tool 1.0.0",
        isComplete: () => false,
        populate: async () => {
          throw new Error("offline");
        },
      }),
    ).rejects.toThrow("offline");
    expect(fs.readFileSync(path.join(destDir, "bin"), "utf8")).toBe("stale");
  });
});

// Asset names as published on each tool's GitHub releases.
describe("asset names", () => {
  test("moc", () => {
    expect(asset(moc.assetUrl("1.16.1", macArm))).toBe(
      "motoko-Darwin-arm64-1.16.1.tar.gz",
    );
    expect(asset(moc.assetUrl("1.16.1", macIntel))).toBe(
      "motoko-Darwin-x86_64-1.16.1.tar.gz",
    );
    expect(asset(moc.assetUrl("1.16.1", linuxArm))).toBe(
      "motoko-Linux-aarch64-1.16.1.tar.gz",
    );
    expect(asset(moc.assetUrl("1.16.1", linuxIntel))).toBe(
      "motoko-Linux-x86_64-1.16.1.tar.gz",
    );
    expect(asset(moc.assetUrl("0.14.5", macArm))).toBe(
      "motoko-Darwin-x86_64-0.14.5.tar.gz",
    );
    expect(asset(moc.assetUrl("0.9.4", macArm))).toBe(
      "motoko-macos-0.9.4.tar.gz",
    );
    expect(asset(moc.assetUrl("0.9.4", linuxIntel))).toBe(
      "motoko-linux64-0.9.4.tar.gz",
    );
  });

  test("pocket-ic", () => {
    expect(asset(pocketIc.assetUrl("15.0.0", macArm))).toBe(
      "pocket-ic-arm64-darwin.gz",
    );
    expect(asset(pocketIc.assetUrl("15.0.0", macIntel))).toBe(
      "pocket-ic-x86_64-darwin.gz",
    );
    expect(asset(pocketIc.assetUrl("15.0.0", linuxArm))).toBe(
      "pocket-ic-arm64-linux.gz",
    );
    expect(asset(pocketIc.assetUrl("15.0.0", linuxIntel))).toBe(
      "pocket-ic-x86_64-linux.gz",
    );
    expect(asset(pocketIc.assetUrl("9.0.2", macArm))).toBe(
      "pocket-ic-arm64-darwin.gz",
    );
    expect(asset(pocketIc.assetUrl("9.0.1", macArm))).toBe(
      "pocket-ic-x86_64-darwin.gz",
    );
  });

  test("lintoko", () => {
    expect(asset(lintoko.assetUrl("0.11.0", macArm))).toBe(
      "lintoko-aarch64-apple-darwin.tar.xz",
    );
    expect(asset(lintoko.assetUrl("0.11.0", linuxArm))).toBe(
      "lintoko-aarch64-unknown-linux-gnu.tar.xz",
    );
    expect(asset(lintoko.assetUrl("0.11.0", linuxIntel))).toBe(
      "lintoko-x86_64-unknown-linux-gnu.tar.xz",
    );
  });

  test("mo-fmt", () => {
    expect(asset(moFmt.assetUrl("0.1.0", macArm))).toBe(
      "mo-fmt-aarch64-apple-darwin.tar.xz",
    );
    expect(asset(moFmt.assetUrl("0.1.0", macIntel))).toBe(
      "mo-fmt-x86_64-apple-darwin.tar.xz",
    );
    expect(asset(moFmt.assetUrl("0.1.0", linuxArm))).toBe(
      "mo-fmt-aarch64-unknown-linux-musl.tar.xz",
    );
    expect(asset(moFmt.assetUrl("0.1.0", linuxIntel))).toBe(
      "mo-fmt-x86_64-unknown-linux-musl.tar.xz",
    );
  });

  test("wasmtime", () => {
    expect(asset(wasmtime.assetUrl("49.0.1", macArm))).toBe(
      "wasmtime-v49.0.1-aarch64-macos.tar.xz",
    );
    expect(asset(wasmtime.assetUrl("49.0.1", macIntel))).toBe(
      "wasmtime-v49.0.1-x86_64-macos.tar.xz",
    );
    expect(asset(wasmtime.assetUrl("49.0.1", linuxArm))).toBe(
      "wasmtime-v49.0.1-aarch64-linux.tar.xz",
    );
    expect(asset(wasmtime.assetUrl("49.0.1", linuxIntel))).toBe(
      "wasmtime-v49.0.1-x86_64-linux.tar.xz",
    );
  });

  test("wasm-opt", () => {
    expect(asset(wasmOpt.assetUrl("133", macArm))).toBe(
      "binaryen-version_133-arm64-macos.tar.gz",
    );
    expect(asset(wasmOpt.assetUrl("133", macIntel))).toBe(
      "binaryen-version_133-x86_64-macos.tar.gz",
    );
    expect(asset(wasmOpt.assetUrl("133", linuxArm))).toBe(
      "binaryen-version_133-aarch64-linux.tar.gz",
    );
    expect(asset(wasmOpt.assetUrl("133", linuxIntel))).toBe(
      "binaryen-version_133-x86_64-linux.tar.gz",
    );
  });
});
