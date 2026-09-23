import { createReader, type BinaryReader } from "./reader";

/** Turns WOFF2 data into an uncompressed sfnt (TrueType or OpenType) font. */
export type Woff2Decoder = (data: Uint8Array) => Promise<Uint8Array>;

type ContainerFormat = "sfnt" | "woff" | "woff2" | "collection";

const SFNT_SIGNATURES = new Set(["\0\x01\0\0", "OTTO", "true"]);
const SIGNATURES: Record<string, ContainerFormat> = {
  wOFF: "woff",
  wOF2: "woff2",
  ttcf: "collection",
};

const SFNT_HEADER_SIZE = 12;
const SFNT_TABLE_RECORD_SIZE = 16;
const WOFF_HEADER_SIZE = 44;
const WOFF_TABLE_ENTRY_SIZE = 20;
const RESOURCE_FORK_HEADER_SIZE = 16;

const COLLECTION_ERROR =
  "Font collections (TTC/DFONT) are not supported. Provide a single font file.";

/**
 * Whether the data is a Mac resource fork (DFONT): four header fields where the resource map
 * follows the resource data and ends exactly at the end of the file.
 */
function isResourceFork(reader: BinaryReader): boolean {
  if (reader.length < RESOURCE_FORK_HEADER_SIZE) {
    return false;
  }
  const dataOffset = reader.uint32(0);
  const mapOffset = reader.uint32(4);
  const dataLength = reader.uint32(8);
  const mapLength = reader.uint32(12);
  return (
    dataOffset >= RESOURCE_FORK_HEADER_SIZE &&
    mapOffset >= dataOffset + dataLength &&
    mapLength > 0 &&
    mapOffset + mapLength === reader.length
  );
}

function detectFormat(reader: BinaryReader): ContainerFormat {
  if (reader.length < 4) {
    throw new Error("Unsupported font format: the data is too short to be a font");
  }
  const signature = reader.tag(0);
  if (SFNT_SIGNATURES.has(signature)) {
    return "sfnt";
  }
  const format = SIGNATURES[signature] ?? (isResourceFork(reader) ? "collection" : undefined);
  if (!format) {
    throw new Error("Unsupported font format: expected TrueType, OpenType, WOFF or WOFF2 data");
  }
  return format;
}

/** Inflates zlib data with the web-standard DecompressionStream, available in Node and browsers. */
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

interface SfntTable {
  tag: number;
  checksum: number;
  data: Uint8Array;
}

async function readWoffTable(reader: BinaryReader, entry: number): Promise<SfntTable> {
  const name = reader.tag(entry);
  const offset = reader.uint32(entry + 4);
  const compLength = reader.uint32(entry + 8);
  const origLength = reader.uint32(entry + 12);
  const table = { tag: reader.uint32(entry), checksum: reader.uint32(entry + 16) };
  const stored = reader.bytes(offset, compLength);
  if (compLength > origLength) {
    throw new Error(`Malformed WOFF file: table "${name}" is longer than its original length`);
  }
  if (compLength === origLength) {
    return { ...table, data: stored };
  }
  const data = await inflate(stored).catch((error: unknown) => {
    throw new Error(`Malformed WOFF file: table "${name}" cannot be decompressed`, {
      cause: error,
    });
  });
  if (data.length !== origLength) {
    throw new Error(
      `Malformed WOFF file: table "${name}" decompresses to ${data.length} bytes, expected ${origLength}`,
    );
  }
  return { ...table, data };
}

const padded = (length: number): number => Math.ceil(length / 4) * 4;

/** Packs tables into an sfnt with the given version; tables keep their order and checksums. */
function packSfnt(flavor: number, tables: SfntTable[]): Uint8Array {
  const directorySize = SFNT_HEADER_SIZE + tables.length * SFNT_TABLE_RECORD_SIZE;
  const offsets = tables.reduce<number[]>(
    (acc, table, index) => [...acc, acc[index] + padded(table.data.length)],
    [directorySize],
  );
  const out = new Uint8Array(offsets[tables.length]);
  const view = new DataView(out.buffer);
  const entrySelector = Math.floor(Math.log2(Math.max(tables.length, 1)));
  const searchRange = 2 ** entrySelector * SFNT_TABLE_RECORD_SIZE;

  view.setUint32(0, flavor);
  view.setUint16(4, tables.length);
  view.setUint16(6, searchRange);
  view.setUint16(8, entrySelector);
  view.setUint16(10, tables.length * SFNT_TABLE_RECORD_SIZE - searchRange);
  tables.forEach(({ tag, checksum, data }, index) => {
    const record = SFNT_HEADER_SIZE + index * SFNT_TABLE_RECORD_SIZE;
    view.setUint32(record, tag);
    view.setUint32(record + 4, checksum);
    view.setUint32(record + 8, offsets[index]);
    view.setUint32(record + 12, data.length);
    out.set(data, offsets[index]);
  });
  return out;
}

/** WOFF 1.0: every table is stored as is or zlib-compressed. */
async function woffToSfnt(data: Uint8Array): Promise<Uint8Array> {
  const reader = createReader(data, "WOFF file");
  const flavor = reader.uint32(4);
  const entries = Array.from(
    { length: reader.uint16(12) },
    (_, index) => WOFF_HEADER_SIZE + index * WOFF_TABLE_ENTRY_SIZE,
  );
  const tables = await Promise.all(entries.map((entry) => readWoffTable(reader, entry)));
  return packSfnt(flavor, tables);
}

/**
 * Returns the font as an uncompressed sfnt, which is what HarfBuzz reads. WOFF is inflated
 * here, WOFF2 goes to `decodeWoff2`; font collections are rejected.
 */
export async function toSfnt(data: Uint8Array, decodeWoff2: Woff2Decoder): Promise<Uint8Array> {
  switch (detectFormat(createReader(data, "font data"))) {
    case "sfnt": {
      return data;
    }
    case "woff": {
      return await woffToSfnt(data);
    }
    case "woff2": {
      return await decodeWoff2(data);
    }
    case "collection": {
      throw new Error(COLLECTION_ERROR);
    }
  }
}
