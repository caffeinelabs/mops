import { describe, expect, test } from "@jest/globals";
import {
  listCustomSections,
  replaceCandidService,
} from "../helpers/wasm-metadata";

const HEADER = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
const text = (s: string) => [...new TextEncoder().encode(s)];

function custom(name: string, data: number[]): number[] {
  let payload = [name.length, ...text(name), ...data];
  return [0x00, payload.length, ...payload];
}

// A type section with one `() -> ()` signature, then three custom sections.
const TYPE_SECTION = [0x01, 0x04, 0x01, 0x60, 0x00, 0x00];
const NAME_SECTION = custom("name", [0x00, 0x03, 0x02, 0x66, 0x6f]);
const ARGS_SECTION = custom("icp:public candid:args", text("(nat)"));

function module(...sections: number[][]): Uint8Array {
  return Uint8Array.from([...HEADER, ...sections.flat()]);
}

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("replaceCandidService", () => {
  test("swaps the data and copies every other section verbatim", () => {
    let wasm = module(
      TYPE_SECTION,
      NAME_SECTION,
      custom("icp:public candid:service", text("service : {}")),
      ARGS_SECTION,
    );
    let curated = "service : { greet : () -> (text) query }";
    let out = replaceCandidService(wasm, curated)!;

    expect(out).toEqual(
      module(
        TYPE_SECTION,
        NAME_SECTION,
        custom("icp:public candid:service", text(curated)),
        ARGS_SECTION,
      ),
    );
  });

  test("keeps the visibility moc chose", () => {
    let wasm = module(
      custom("icp:private candid:service", text("service : {}")),
    );
    let out = replaceCandidService(wasm, "service : { x : () -> () }")!;
    expect(listCustomSections(out).map((s) => s.name)).toEqual([
      "icp:private candid:service",
    ]);
  });

  test("returns null when moc omitted the section", () => {
    expect(replaceCandidService(module(TYPE_SECTION, NAME_SECTION), "")).toBe(
      null,
    );
  });

  test("encodes a section larger than 127 bytes with a multi-byte size", () => {
    let curated = `service : { ${"a".repeat(300)} : () -> () }`;
    let out = replaceCandidService(
      module(custom("icp:public candid:service", [])),
      curated,
    )!;
    let [section] = listCustomSections(out);
    expect(decode(section!.data)).toBe(curated);
  });

  test("rejects bytes that are not a Wasm module", () => {
    expect(() => replaceCandidService(Uint8Array.of(1, 2, 3), "")).toThrow(
      "Not a Wasm module",
    );
  });

  test("rejects a section that runs past the end", () => {
    let wasm = Uint8Array.from([...HEADER, 0x00, 0x7f, 0x01]);
    expect(() => listCustomSections(wasm)).toThrow("runs past the end");
  });
});
