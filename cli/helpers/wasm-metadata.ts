// Byte-level edits of a Wasm module's custom sections. Every section we don't
// touch is copied verbatim, so moc's `name` section and anything else it emits
// survive (a parse-and-re-emit pass through a Wasm IR does not guarantee that).

const WASM_HEADER = Uint8Array.of(
  0x00,
  0x61,
  0x73,
  0x6d,
  0x01,
  0x00,
  0x00,
  0x00,
);
const CUSTOM_SECTION_ID = 0;

export interface WasmCustomSection {
  name: string;
  data: Uint8Array;
}

interface RawSection {
  id: number;
  /** The whole section: id byte, size and payload. */
  bytes: Uint8Array;
  /** Set for custom sections only. */
  custom?: WasmCustomSection;
}

function readU32(bytes: Uint8Array, offset: number): [number, number] {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    if (offset + i >= bytes.length) {
      throw new Error("Malformed Wasm module: truncated LEB128 integer");
    }
    let byte = bytes[offset + i]!;
    value += (byte & 0x7f) * 2 ** (7 * i);
    if (byte < 0x80) {
      return [value, offset + i + 1];
    }
  }
  throw new Error("Malformed Wasm module: LEB128 integer too long");
}

function encodeU32(value: number): Uint8Array {
  let out: number[] = [];
  do {
    let byte = value & 0x7f;
    value = Math.floor(value / 128);
    out.push(value ? byte | 0x80 : byte);
  } while (value);
  return Uint8Array.from(out);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (let chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function parseSections(wasm: Uint8Array): RawSection[] {
  if (
    wasm.length < WASM_HEADER.length ||
    WASM_HEADER.some((byte, i) => wasm[i] !== byte)
  ) {
    throw new Error("Not a Wasm module (bad magic number or version)");
  }
  let decoder = new TextDecoder("utf-8", { fatal: true });
  let sections: RawSection[] = [];
  let offset = WASM_HEADER.length;
  while (offset < wasm.length) {
    let start = offset;
    let id = wasm[offset]!;
    let [size, payloadStart] = readU32(wasm, offset + 1);
    let end = payloadStart + size;
    if (end > wasm.length) {
      throw new Error("Malformed Wasm module: section runs past the end");
    }
    let section: RawSection = { id, bytes: wasm.subarray(start, end) };
    if (id === CUSTOM_SECTION_ID) {
      let [nameLength, nameStart] = readU32(wasm, payloadStart);
      let nameEnd = nameStart + nameLength;
      if (nameEnd > end) {
        throw new Error("Malformed Wasm module: custom section name too long");
      }
      section.custom = {
        name: decoder.decode(wasm.subarray(nameStart, nameEnd)),
        data: wasm.subarray(nameEnd, end),
      };
    }
    sections.push(section);
    offset = end;
  }
  return sections;
}

function encodeCustomSection({ name, data }: WasmCustomSection): Uint8Array {
  let nameBytes = new TextEncoder().encode(name);
  let nameLength = encodeU32(nameBytes.length);
  let size = nameLength.length + nameBytes.length + data.length;
  return concat([
    Uint8Array.of(CUSTOM_SECTION_ID),
    encodeU32(size),
    nameLength,
    nameBytes,
    data,
  ]);
}

/** The module's custom sections, in order. */
export function listCustomSections(wasm: Uint8Array): WasmCustomSection[] {
  return parseSections(wasm).flatMap((s) => (s.custom ? [s.custom] : []));
}

/**
 * Replace the data of the `candid:service` metadata section in place, keeping
 * the `icp:public` / `icp:private` visibility moc gave it. Returns `null` when
 * the module has no such section (moc ran with `--omit-metadata candid:service`).
 */
export function replaceCandidService(
  wasm: Uint8Array,
  candid: string,
): Uint8Array | null {
  let data = new TextEncoder().encode(candid);
  let replaced = false;
  let chunks = parseSections(wasm).map((section) => {
    let name = section.custom?.name;
    if (
      name !== "icp:public candid:service" &&
      name !== "icp:private candid:service"
    ) {
      return section.bytes;
    }
    replaced = true;
    return encodeCustomSection({ name, data });
  });
  return replaced ? concat([WASM_HEADER, ...chunks]) : null;
}
